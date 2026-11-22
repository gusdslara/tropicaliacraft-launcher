import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import javax.inject.Inject
import org.gradle.process.ExecOperations

abstract class BuildTask : DefaultTask() {
    @get:Inject
    abstract val execOperations: ExecOperations

    @Input
    var rootDirRel: String? = null
    @Input
    var projectDir: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val abi = when (target) {
            "aarch64" -> "arm64-v8a"
            "armv7" -> "armeabi-v7a"
            "i686" -> "x86"
            "x86_64" -> "x86_64"
            else -> "arm64-v8a"
        }
        val mode = if (release == true) "release" else "debug"
        val targetTriple = when (target) {
            "aarch64" -> "aarch64-linux-android"
            "armv7" -> "armv7-linux-androideabi"
            "i686" -> "i686-linux-android"
            "x86_64" -> "x86_64-linux-android"
            else -> "${target}-linux-android"
        }
        val targetSo = File(projectDir, "../../../target/$targetTriple/$mode/libtropicalia_launcher_lib.so")
        val destDir = File(projectDir, "src/main/jniLibs/$abi")
        val destSo = File(destDir, "libtropicalia_launcher_lib.so")

        if (destSo.exists()) {
            logger.lifecycle("Native library $destSo already present in jniLibs, using it.")
            return
        }

        if (targetSo.exists()) {
            destDir.mkdirs()
            targetSo.copyTo(destSo, overwrite = true)
            logger.lifecycle("Copied native library $targetSo to $destSo successfully!")
            return
        }

        val executable = """npm""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (targetSo.exists()) {
                destDir.mkdirs()
                targetSo.copyTo(destSo, overwrite = true)
                logger.lifecycle("Copied native library after CLI fallback: $targetSo to $destSo")
                return
            }
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )

                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                if (targetSo.exists()) {
                    destDir.mkdirs()
                    targetSo.copyTo(destSo, overwrite = true)
                    logger.lifecycle("Copied native library after fallback: $targetSo to $destSo")
                    return
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")
        val args = listOf("run", "--", "tauri", "android", "android-studio-script");

        execOperations.exec {
            workingDir(File(projectDir, rootDirRel))
            executable(executable)
            args(args)
            if (logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}
