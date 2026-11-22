#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <dlfcn.h>
#include <unistd.h>

typedef int (*JLI_Launch_t)(int argc, char **argv,
                            int jargc, const char** jargv,
                            int appclassc, const char** appclassv,
                            const char* fullversion,
                            const char* dotversion,
                            const char* pname,
                            const char* lname,
                            int javaargs,
                            int cpwildcard,
                            int javaw,
                            int ergo);

static void* try_dlopen(const char* dir, const char* rel) {
    if (!dir || !*dir) return NULL;
    char path[1024];
    snprintf(path, sizeof(path), "%s/%s", dir, rel);
    if (access(path, F_OK) == 0) {
        void* h = dlopen(path, RTLD_NOW | RTLD_GLOBAL);
        return h;
    }
    return NULL;
}

static void* find_and_dlopen(const char* java_home, const char* ld_path, const char* lib_rel_candidates[], size_t n_candidates, const char* direct_name) {
    // 1. Try from JAVA_HOME
    if (java_home && *java_home) {
        for (size_t i = 0; i < n_candidates; i++) {
            void* h = try_dlopen(java_home, lib_rel_candidates[i]);
            if (h) return h;
        }
    }
    // 2. Try from LD_LIBRARY_PATH
    if (ld_path && *ld_path) {
        char buf[4096];
        strncpy(buf, ld_path, sizeof(buf) - 1);
        buf[sizeof(buf) - 1] = '\0';
        char* token = strtok(buf, ":");
        while (token) {
            char path[1024];
            snprintf(path, sizeof(path), "%s/%s", token, direct_name);
            if (access(path, F_OK) == 0) {
                void* h = dlopen(path, RTLD_NOW | RTLD_GLOBAL);
                if (h) return h;
            }
            token = strtok(NULL, ":");
        }
    }
    // 3. Fallback to direct name
    return dlopen(direct_name, RTLD_NOW | RTLD_GLOBAL);
}

int main(int argc, char** argv) {
    char* java_home = getenv("JAVA_HOME");
    const char* ld_path = getenv("LD_LIBRARY_PATH");

    if (argc >= 1) {
        argv[0] = "java";
    }

    // 1. Load libjvm.so
    const char* jvm_candidates[] = {
        "lib/server/libjvm.so",
        "lib/aarch64/server/libjvm.so",
        "lib/client/libjvm.so",
        "lib/aarch64/client/libjvm.so"
    };
    find_and_dlopen(java_home, ld_path, jvm_candidates, sizeof(jvm_candidates)/sizeof(jvm_candidates[0]), "libjvm.so");

    // Pre-load common dependencies if available
    const char* verify_candidates[] = { "lib/libverify.so", "lib/aarch64/libverify.so" };
    find_and_dlopen(java_home, ld_path, verify_candidates, sizeof(verify_candidates)/sizeof(verify_candidates[0]), "libverify.so");
    const char* java_candidates[] = { "lib/libjava.so", "lib/aarch64/libjava.so" };
    find_and_dlopen(java_home, ld_path, java_candidates, sizeof(java_candidates)/sizeof(java_candidates[0]), "libjava.so");

    // 2. Load libjli.so
    const char* jli_candidates[] = {
        "lib/libjli.so",
        "lib/jli/libjli.so",
        "lib/aarch64/jli/libjli.so",
        "lib/aarch64/libjli.so",
        "lib/arm64/jli/libjli.so",
        "lib/arm64/libjli.so"
    };
    void* handle = find_and_dlopen(java_home, ld_path, jli_candidates, sizeof(jli_candidates)/sizeof(jli_candidates[0]), "libjli.so");
    if (!handle) {
        fprintf(stderr, "libjava_exec: failed to dlopen libjli.so: %s (JAVA_HOME=%s)\n", dlerror(), java_home ? java_home : "<null>");
        return 127;
    }

    JLI_Launch_t jli_launch = (JLI_Launch_t)dlsym(handle, "JLI_Launch");
    if (!jli_launch) {
        jli_launch = (JLI_Launch_t)dlsym(RTLD_DEFAULT, "JLI_Launch");
    }
    if (!jli_launch) {
        fprintf(stderr, "libjava_exec: failed to dlsym JLI_Launch: %s\n", dlerror());
        return 127;
    }

    const char* prog = (argc >= 1 && argv[0]) ? argv[0] : "java";
    return jli_launch(argc, argv, 0, NULL, 0, NULL, "1.8.0-internal", "1.8", prog, prog, 0, 1, 0, 0);
}
