// Tropicalia: thin wrapper around the system Vulkan loader for desktop renderers.
//
// Android reports the display rotation as the surface's currentTransform and expects the
// application to pre-rotate its frames. Minecraft's Vulkan backend copies currentTransform
// into the swapchain without rotating anything, so a landscape game comes out sideways.
// Reporting an identity transform makes the compositor do the rotation instead; the
// resulting VK_SUBOPTIMAL_KHR is hidden so the game does not rebuild its swapchain forever.

#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

#define VK_SUCCESS 0
#define VK_SUBOPTIMAL_KHR 1000001003
#define VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR 1u
#define EXPORT __attribute__((visibility("default")))

typedef void (*vk_fn)(void);
typedef vk_fn (*proc_addr_fn)(void*, const char*);

static void* real_library;
static proc_addr_fn real_instance_proc_addr;
static proc_addr_fn real_device_proc_addr;
static int32_t (*real_surface_caps)(void*, uint64_t, uint32_t*);
static int32_t (*real_surface_caps2)(void*, const void*, uint8_t*);
static int32_t (*real_queue_present)(void*, const uint8_t*);
static int32_t (*real_acquire)(void*, uint64_t, uint64_t, uint64_t, uint64_t, uint32_t*);
static int32_t (*real_acquire2)(void*, const void*, uint32_t*);

static void* real_symbol(const char* name) {
    if (!real_library) real_library = dlopen("libvulkan.so", RTLD_LOCAL | RTLD_NOW);
    return real_library ? dlsym(real_library, name) : NULL;
}

// VkSurfaceCapabilitiesKHR: supportedTransforms is the 10th uint32, currentTransform the 11th.
static void force_identity(uint32_t* caps) {
    caps[9] |= VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR;
    caps[10] = VK_SURFACE_TRANSFORM_IDENTITY_BIT_KHR;
}

static int32_t shim_surface_caps(void* device, uint64_t surface, uint32_t* caps) {
    int32_t result = real_surface_caps(device, surface, caps);
    if (result == VK_SUCCESS && caps) force_identity(caps);
    return result;
}

// VkSurfaceCapabilities2KHR: sType, pNext, then the embedded VkSurfaceCapabilitiesKHR.
static int32_t shim_surface_caps2(void* device, const void* info, uint8_t* caps) {
    int32_t result = real_surface_caps2(device, info, caps);
    if (result == VK_SUCCESS && caps) force_identity((uint32_t*) (caps + 16));
    return result;
}

static int32_t optimal(int32_t result) {
    return result == VK_SUBOPTIMAL_KHR ? VK_SUCCESS : result;
}

// VkPresentInfoKHR: swapchainCount at offset 32, pResults at offset 56.
static int32_t shim_queue_present(void* queue, const uint8_t* info) {
    int32_t result = real_queue_present(queue, info);
    if (info) {
        uint32_t count;
        int32_t* results;
        memcpy(&count, info + 32, sizeof(count));
        memcpy(&results, info + 56, sizeof(results));
        if (results) for (uint32_t i = 0; i < count; i++) results[i] = optimal(results[i]);
    }
    return optimal(result);
}

static int32_t shim_acquire(void* device, uint64_t swapchain, uint64_t timeout, uint64_t semaphore, uint64_t fence, uint32_t* index) {
    return optimal(real_acquire(device, swapchain, timeout, semaphore, fence, index));
}

static int32_t shim_acquire2(void* device, const void* info, uint32_t* index) {
    return optimal(real_acquire2(device, info, index));
}

static vk_fn shim_device_proc_addr(void* device, const char* name);

static vk_fn intercept(const char* name, vk_fn real) {
    if (!real || !name) return real;
#define HOOK(symbol, slot, shim) if (!strcmp(name, symbol)) { slot = (void*) real; return (vk_fn) shim; }
    HOOK("vkGetPhysicalDeviceSurfaceCapabilitiesKHR", real_surface_caps, shim_surface_caps)
    HOOK("vkGetPhysicalDeviceSurfaceCapabilities2KHR", real_surface_caps2, shim_surface_caps2)
    HOOK("vkQueuePresentKHR", real_queue_present, shim_queue_present)
    HOOK("vkAcquireNextImageKHR", real_acquire, shim_acquire)
    HOOK("vkAcquireNextImage2KHR", real_acquire2, shim_acquire2)
    HOOK("vkGetDeviceProcAddr", real_device_proc_addr, shim_device_proc_addr)
#undef HOOK
    return real;
}

static vk_fn shim_device_proc_addr(void* device, const char* name) {
    return intercept(name, real_device_proc_addr(device, name));
}

EXPORT vk_fn vkGetInstanceProcAddr(void* instance, const char* name) {
    if (!real_instance_proc_addr) real_instance_proc_addr = (proc_addr_fn) real_symbol("vkGetInstanceProcAddr");
    if (!real_instance_proc_addr) return NULL;
    return intercept(name, real_instance_proc_addr(instance, name));
}

EXPORT vk_fn vkGetDeviceProcAddr(void* device, const char* name) {
    if (!real_device_proc_addr) real_device_proc_addr = (proc_addr_fn) real_symbol("vkGetDeviceProcAddr");
    if (!real_device_proc_addr) return NULL;
    return shim_device_proc_addr(device, name);
}

// Global commands some loaders resolve with dlsym instead of vkGetInstanceProcAddr.
EXPORT int32_t vkCreateInstance(const void* info, const void* allocator, void* instance) {
    int32_t (*real)(const void*, const void*, void*) = real_symbol("vkCreateInstance");
    return real ? real(info, allocator, instance) : -3;
}

EXPORT int32_t vkEnumerateInstanceExtensionProperties(const char* layer, uint32_t* count, void* properties) {
    int32_t (*real)(const char*, uint32_t*, void*) = real_symbol("vkEnumerateInstanceExtensionProperties");
    return real ? real(layer, count, properties) : -3;
}

EXPORT int32_t vkEnumerateInstanceLayerProperties(uint32_t* count, void* properties) {
    int32_t (*real)(uint32_t*, void*) = real_symbol("vkEnumerateInstanceLayerProperties");
    return real ? real(count, properties) : -3;
}

EXPORT int32_t vkEnumerateInstanceVersion(uint32_t* version) {
    int32_t (*real)(uint32_t*) = real_symbol("vkEnumerateInstanceVersion");
    if (real) return real(version);
    if (version) *version = 1u << 22;
    return VK_SUCCESS;
}
