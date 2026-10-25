// Sends the release APK to F-Droid Panel after each release build.
//
// Copy this file next to the build.gradle.kts of your app module, add this line to that file:
//     apply(from = "fdroid-panel.gradle.kts")
// and these lines, shown by the panel when you create an upload key, to local.properties or
// keystore.properties at the root of the project, files you keep out of version control:
//     fdroidPanel.url=https://fdroid.example.org
//     fdroidPanel.repository=1
//     fdroidPanel.key=fdp_...
// Without them, builds go on as before and nothing is sent. See docs/AUTOMATION.md.

import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse

val settingsFiles = listOf("local.properties", "keystore.properties")
val fdroidPanel = java.util.Properties().apply {
    for (name in settingsFiles) {
        val file = rootProject.file(name)
        if (file.isFile) file.inputStream().use { load(it) }
    }
}
val settingsPlace = settingsFiles.joinToString(" or ")

class PanelError(val status: Int, val code: String, val params: Any?) :
    GradleException("F-Droid Panel answered $status: $code ${params ?: ""}".trim())

val uploadToFdroidPanel by tasks.registering {
    group = "publishing"
    description = "Sends the signed release APK to F-Droid Panel."
    onlyIf("fdroidPanel.key is set in $settingsPlace") { fdroidPanel.getProperty("fdroidPanel.key") != null }
    // Where the release build puts the APK, and where the "Generate Signed APK" wizard copies it.
    val apkDirectories = listOf(layout.buildDirectory.dir("outputs/apk"), layout.projectDirectory.dir("release"))
    doLast {
        val url = fdroidPanel.getProperty("fdroidPanel.url")?.trimEnd('/')
            ?: throw GradleException("fdroidPanel.url is missing in $settingsPlace")
        val repository = fdroidPanel.getProperty("fdroidPanel.repository")
            ?: throw GradleException("fdroidPanel.repository is missing in $settingsPlace")
        val key = fdroidPanel.getProperty("fdroidPanel.key")
        val apk = files(apkDirectories).asFileTree.matching {
            include("**/release/*.apk", "*.apk")
            exclude("**/*-unsigned.apk")
        }.files.maxByOrNull { it.lastModified() }
            ?: throw GradleException("No signed release APK in build/outputs/apk or release/")

        val client = HttpClient.newHttpClient()
        val uploads = "$url/admin/api/repositories/$repository/uploads"
        fun call(path: String, configure: HttpRequest.Builder.() -> Unit): Map<*, *> {
            val request = HttpRequest.newBuilder(URI.create(path)).header("Authorization", "Bearer $key")
            request.configure()
            val response = client.send(request.build(), HttpResponse.BodyHandlers.ofString())
            val body = response.body().takeIf { it.isNotBlank() }?.let { JsonSlurper().parseText(it) as? Map<*, *> }
            if (response.statusCode() >= 300) {
                val error = body?.get("error") as? Map<*, *>
                throw PanelError(response.statusCode(), error?.get("code")?.toString() ?: "error", error?.get("params"))
            }
            return body ?: emptyMap<String, Any>()
        }
        fun json(value: Any): HttpRequest.BodyPublisher = HttpRequest.BodyPublishers.ofString(JsonOutput.toJson(value))

        val bytes = apk.readBytes()
        var upload = call(uploads) {
            header("Content-Type", "application/json")
            POST(json(mapOf("filename" to apk.name, "size" to bytes.size)))
        }
        val id = upload["id"]
        // A reverse proxy that refuses large requests (HTTP 413) makes the chunks smaller, as in the panel.
        var chunk = 4 * 1024 * 1024
        while (upload["status"] == "receiving") {
            val offset = (upload["received"] as Number).toInt()
            val size = minOf(chunk, bytes.size - offset)
            try {
                upload = call("$uploads/$id?offset=$offset") {
                    header("Content-Type", "application/octet-stream")
                    PUT(HttpRequest.BodyPublishers.ofByteArray(bytes, offset, size))
                }
            } catch (error: PanelError) {
                if (error.status != 413 || chunk <= 256 * 1024) throw error
                chunk /= 2
            }
        }

        val checks = upload["checks"] as? Map<*, *>
        for (warning in checks?.get("warnings") as? List<*> ?: emptyList<Any>()) {
            logger.warn("F-Droid Panel: ${(warning as Map<*, *>)["code"]} ${warning["params"]}")
        }
        if (upload["status"] != "ready") {
            call("$uploads/$id") { DELETE() }
            throw GradleException("F-Droid Panel refused ${apk.name}: ${checks?.get("blocking")}")
        }
        val added = call("$uploads/$id/add") {
            header("Content-Type", "application/json")
            POST(json(emptyMap<String, Any>()))
        }
        val published = if (added["publishJobId"] != null) ", publication started" else ""
        logger.lifecycle("F-Droid Panel: ${apk.name} added to ${added["packageName"]}$published")
    }
}

tasks.matching { it.name == "assembleRelease" }.configureEach { finalizedBy(uploadToFdroidPanel) }
