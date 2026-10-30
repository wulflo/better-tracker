// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

package app.tauri.barcodescanner

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Context.MODE_PRIVATE
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.util.Size
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.result.ActivityResult
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import app.tauri.Logger
import app.tauri.PermissionState
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.common.util.concurrent.ListenableFuture
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.Collections
import java.util.concurrent.ExecutionException

private const val PERMISSION_ALIAS_CAMERA = "camera"
private const val PERMISSION_NAME = Manifest.permission.CAMERA

@InvokeArg
class ScanOptions {
    var formats: Array<String>? = null
    var windowed: Boolean = false
    var cameraDirection: String? = null
}

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera")
    ]
)
class BarcodeScannerPlugin(private val activity: Activity) : Plugin(activity),
    ImageAnalysis.Analyzer {
    private lateinit var webView: WebView
    private var previewView: PreviewView? = null
    private var cameraProviderFuture: ListenableFuture<ProcessCameraProvider>? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private var graphicOverlay: GraphicOverlay? = null
    private var camera: Camera? = null
        set(value) {
            field = value
            activeCamera = value
        }
    private var vibrator: Vibrator? = null

    private var scannerOptions: BarcodeScannerOptions? = null
    private var scanner: com.google.mlkit.vision.barcode.BarcodeScanner? = null

    private var requestPermissionResponse: JSObject? = null
    private var windowed = false

    // declare a map constant for allowed barcode formats
    private val supportedFormats = supportedFormats()

    private var savedInvoke: Invoke? = null
    private var webViewBackground: Drawable? = null
    // `true` solo cuando se ha puesto el fondo de la WebView transparente, para
    // no pintarlo de blanco si el escaneo falla antes de llegar a ese punto.
    private var backgroundOverridden = false

    // Contenedor donde se montan `previewView` y `graphicOverlay`. Se guarda para
    // retirarlos del mismo sitio incluso si la jerarquía de vistas cambia.
    private var previewContainer: ViewGroup? = null

    override fun load(webView: WebView) {
        super.load(webView)
        this.webView = webView
    }

    /**
     * Contenedor de la vista previa.
     *
     * Upstream hacía `webView.parent as ViewGroup`, que lanza un NPE opaco
     * (`attempt to invoke virtual method ... getClass() on a null object
     * reference`) cuando la WebView todavía no está enganchada a la actividad.
     * Como respaldo se usa el contenedor de contenido de la actividad.
     */
    private fun cameraContainer(): ViewGroup {
        val parent = webView.parent as? ViewGroup
        if (parent == null) {
            Logger.error(
                Logger.tags("BarcodeScanner"),
                "La WebView no tiene contenedor; se usa el contenido de la actividad",
                null
            )
        }
        return parent
            ?: activity.findViewById<ViewGroup>(android.R.id.content)
            ?: throw Exception(
                "No se encontró un contenedor donde mostrar la vista previa de la cámara"
            )
    }

    private fun supportedFormats(): Map<String, Int> {
        val map: MutableMap<String, Int> = HashMap()
        map["UPC_A"] = Barcode.FORMAT_UPC_A
        map["UPC_E"] = Barcode.FORMAT_UPC_E
        map["EAN_8"] = Barcode.FORMAT_EAN_8
        map["EAN_13"] = Barcode.FORMAT_EAN_13
        map["CODE_39"] = Barcode.FORMAT_CODE_39
        map["CODE_93"] = Barcode.FORMAT_CODE_93
        map["CODE_128"] = Barcode.FORMAT_CODE_128
        map["CODABAR"] = Barcode.FORMAT_CODABAR
        map["ITF"] = Barcode.FORMAT_ITF
        map["AZTEC"] = Barcode.FORMAT_AZTEC
        map["DATA_MATRIX"] = Barcode.FORMAT_DATA_MATRIX
        map["PDF_417"] = Barcode.FORMAT_PDF417
        map["QR_CODE"] = Barcode.FORMAT_QR_CODE
        return Collections.unmodifiableMap(map)
    }

    private fun hasCamera(): Boolean {
        return activity.packageManager
            .hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)
    }

    /**
     * WebView que está realmente montada en pantalla.
     *
     * Tauri entrega a `load()` la primera WebView que crea. Con varias ventanas
     * (esta app tiene `splash` y `main`) esa puede ser la del splash, que se
     * cierra al arrancar: su `parent` pasa a ser nulo y el escáner fallaba con
     * un NPE. En ese caso se busca la WebView que sigue montada en el contenido
     * de la actividad.
     */
    private fun visibleWebView(): WebView {
        if (webView.parent != null) {
            return webView
        }
        val root = activity.findViewById<ViewGroup>(android.R.id.content)
        val visible = root?.let { findAttachedWebView(it) }
        if (visible == null) {
            Logger.error(
                Logger.tags("BarcodeScanner"),
                "No se encontró una WebView montada; se usa la del plugin",
                null
            )
            return webView
        }
        Logger.warn(
            Logger.tags("BarcodeScanner"),
            "La WebView del plugin no está montada; se usa la visible"
        )
        return visible
    }

    private fun findAttachedWebView(view: View): WebView? {
        if (view is WebView && view.parent != null) {
            return view
        }
        if (view is ViewGroup) {
            for (index in 0 until view.childCount) {
                findAttachedWebView(view.getChildAt(index))?.let { return it }
            }
        }
        return null
    }

    private fun setupCamera(cameraDirection: String, windowed: Boolean) {
        activity
            .runOnUiThread {
                // Si la WebView del plugin ya no está en pantalla (ventana
                // cerrada), se trabaja con la que sí lo está.
                webView = visibleWebView()

                val previewView = PreviewView(activity)
                previewView.layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                this.previewView = previewView

                val graphicOverlay = GraphicOverlay(activity)
                graphicOverlay.layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
                this.graphicOverlay = graphicOverlay

                val parent = cameraContainer()
                previewContainer = parent
                parent.addView(previewView)
                parent.addView(graphicOverlay)

                this.windowed = windowed
                if (windowed) {
                    webView.bringToFront()
                    webViewBackground = webView.background
                    webView.setBackgroundColor(Color.TRANSPARENT)
                    backgroundOverridden = true
                }

                val cameraProviderFuture = ProcessCameraProvider.getInstance(activity)
                cameraProviderFuture.addListener(
                    {
                        try {
                            val cameraProvider = cameraProviderFuture.get()
                            bindPreview(
                                cameraProvider,
                                if (cameraDirection == "front") CameraSelector.LENS_FACING_FRONT else CameraSelector.LENS_FACING_BACK
                            )
                            this.cameraProvider = cameraProvider
                        } catch (e: InterruptedException) {
                            // ignored
                        } catch (_: ExecutionException) {
                            // ignored
                        }
                    },
                    ContextCompat.getMainExecutor(activity)
                )
                this.cameraProviderFuture = cameraProviderFuture
            }
    }

    private fun bindPreview(cameraProvider: ProcessCameraProvider, cameraDirection: Int) {
        activity
            .runOnUiThread {
                val preview = Preview.Builder().build()
                val cameraSelector =
                    CameraSelector.Builder().requireLensFacing(cameraDirection).build()
                preview.setSurfaceProvider(previewView?.surfaceProvider)
                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setTargetResolution(Size(1280, 720))
                    .build()
                imageAnalysis.setAnalyzer(
                    ContextCompat.getMainExecutor(activity),
                    this
                )

                try {
                    camera = cameraProvider.bindToLifecycle(
                        activity as LifecycleOwner,
                        cameraSelector,
                        preview,
                        imageAnalysis
                    )
                } catch (e: Exception) {
                    // TODO
                }
            }
    }

    private fun dismantleCamera() {
        activity
            .runOnUiThread {
                // Se retiran las vistas aunque `cameraProvider` sea nulo: si algo
                // falla justo después de montarlas, la actividad no debe quedarse
                // con una capa transparente y la cámara enlazada.
                cameraProvider?.unbindAll()
                val parent = previewContainer ?: (webView.parent as? ViewGroup)
                previewView?.let { parent?.removeView(it) }
                graphicOverlay?.let { parent?.removeView(it) }
                camera = null
                previewView = null
                graphicOverlay = null
                previewContainer = null
            }
    }

    private fun getFormats(args: ScanOptions): List<Int> {
        val formats = ArrayList<Int>()
        for (format in args.formats ?: arrayOf()) {
            val targetedBarcodeFormat = supportedFormats[format]
            if (targetedBarcodeFormat != null) {
                formats.add(targetedBarcodeFormat)
            }
        }
        return formats
    }

    private fun prepare(direction: String, windowed: Boolean) {
        dismantleCamera()
        setupCamera(direction, windowed)
    }

    private fun destroy() {
        dismantleCamera()
        savedInvoke = null
        if (backgroundOverridden) {
            if (webViewBackground != null) {
                webView.background = webViewBackground
            } else {
                webView.setBackgroundColor(Color.WHITE)
            }
            webViewBackground = null
            backgroundOverridden = false
        }
    }

    @Suppress("DEPRECATION")
    private fun configureCamera(formats: List<Int>) {
        activity
            .runOnUiThread {
                // El servicio de vibración no existe en todos los dispositivos.
                // Antes el cast a `Vibrator` lanzaba un NPE de `getClass()`.
                val vibrator =
                    activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                this.vibrator = vibrator
                if (vibrator == null) {
                    Logger.error(
                        Logger.tags("BarcodeScanner"),
                        "El dispositivo no expone el servicio de vibración",
                        null
                    )
                }
                if (previewView == null) {
                    throw Exception("No se pudo preparar la vista previa de la cámara")
                }

                if (formats.isNotEmpty()) {
                    val mappedFormats = mapFormats(formats)
                    val options =
                        BarcodeScannerOptions.Builder()
                            .setBarcodeFormats(Barcode.FORMAT_QR_CODE, *mappedFormats).build()
                    scannerOptions = options
                    scanner = BarcodeScanning.getClient(options)
                } else {
                    val options = BarcodeScannerOptions.Builder()
                        .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS).build()
                    scannerOptions = options
                    scanner = BarcodeScanning.getClient(options)
                }
            }
    }

    private fun mapFormats(integers: List<Int>): IntArray {
        // Upstream dejaba un `0` en el array cuando la lista incluía QR: el
        // nativo ya añade FORMAT_QR_CODE y un formato 0 es inválido para ML Kit.
        return integers.filter { it != 0 && it != Barcode.FORMAT_QR_CODE }.toIntArray()
    }

    override fun analyze(image: ImageProxy) {
        @SuppressLint("UnsafeOptInUsageError") val mediaImage = image.image
        if (mediaImage != null) {
            val inputImage =
                InputImage.fromMediaImage(mediaImage, image.imageInfo.rotationDegrees)
            scanner
                ?.process(inputImage)
                ?.addOnSuccessListener { barcodes ->
                    if (barcodes.isNotEmpty())  {
                        val barcode = barcodes[0]
                        val bounds = barcode.boundingBox
                        val rawValue = barcode.rawValue ?: ""
                        val rawFormat = barcode.format
                        var format: String? = null

                        for (entry in supportedFormats.entries) {
                            if (entry.value == rawFormat) {
                                format = entry.key
                                break
                            }
                        }

                        val s = bounds?.flattenToString()
                        val jsObject = JSObject()
                        jsObject.put("content", rawValue)
                        jsObject.put("format", format)
                        jsObject.put("bounds", s)

                        savedInvoke?.resolve(jsObject)
                        destroy()
                    }
                }
                ?.addOnFailureListener { e ->
                    Logger.error(e.message ?: e.toString())
                }
                ?.addOnCompleteListener {
                    image.close()
                    mediaImage.close()
                }
        }
    }

    @Command
    fun vibrate(invoke: Invoke) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator?.vibrate(
                VibrationEffect.createOneShot(
                    50,
                    VibrationEffect.DEFAULT_AMPLITUDE
                )
            )
        }
        invoke.resolve()
    }

    @Command
    fun cancel(invoke: Invoke) {
        // Reject the pending scan before destroy() clears savedInvoke, otherwise the
        // scan() promise is never settled. Mirrors the iOS implementation.
        savedInvoke?.reject("cancelled")
        destroy()
        invoke.resolve()
    }

    @Command
    fun scan(invoke: Invoke) {
        val args = invoke.parseArgs(ScanOptions::class.java)

        if (!hasCamera()) {
            invoke.reject("Este dispositivo no tiene cámara")
            return
        }
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            throw Exception("No permission to use camera. Did you request it yet?")
        }

        savedInvoke = invoke
        webViewBackground = null
        try {
            prepare(args.cameraDirection ?: "back", args.windowed)
            configureCamera(getFormats(args))
        } catch (e: Exception) {
            // Si falla la preparación hay que dejar la actividad como estaba
            // (vista previa desmontada y fondo de la WebView restaurado) antes
            // de rechazar, o «Reintentar» se queda con la pantalla en negro.
            savedInvoke = null
            destroy()
            throw e
        }
    }

    @SuppressLint("ObsoleteSdkInt")
    @PermissionCallback
    fun cameraPermissionCallback(invoke: Invoke) {
        if (requestPermissionResponse == null) {
            return
        }

        val requestPermissionResponse = requestPermissionResponse!!

        val granted = getPermissionState(PERMISSION_ALIAS_CAMERA) === PermissionState.GRANTED

        if (granted) {
            requestPermissionResponse.put(PERMISSION_ALIAS_CAMERA, PermissionState.GRANTED)
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                requestPermissionResponse.put(PERMISSION_ALIAS_CAMERA, PermissionState.DENIED)
            } else {
                requestPermissionResponse.put(PERMISSION_ALIAS_CAMERA, PermissionState.GRANTED)
            }
        }

        invoke.resolve(requestPermissionResponse)
        this.requestPermissionResponse = null
    }

    @SuppressLint("ObsoleteSdkInt")
    @Command
    override fun requestPermissions(invoke: Invoke) {
        val requestPermissionResponse = JSObject()
        this.requestPermissionResponse = requestPermissionResponse
        if (getPermissionState(PERMISSION_ALIAS_CAMERA) === PermissionState.GRANTED) {
            requestPermissionResponse.put(PERMISSION_ALIAS_CAMERA, PermissionState.GRANTED)
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                requestPermissionForAlias(
                    PERMISSION_ALIAS_CAMERA,
                    invoke,
                    "cameraPermissionCallback"
                )
                return
            } else {
                requestPermissionResponse.put(PERMISSION_ALIAS_CAMERA, PermissionState.GRANTED)
            }
        }
        invoke.resolve(requestPermissionResponse)
    }

    @Command
    fun openAppSettings(invoke: Invoke) {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", activity.packageName, null)
        )
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivityForResult(invoke, intent, "openSettingsResult")
    }

    @ActivityCallback
    private fun openSettingsResult(invoke: Invoke, result: ActivityResult) {
        invoke.resolve()
    }

    companion object {
        @Volatile
        private var activeCamera: Camera? = null

        /**
         * The camera bound by an active scan, or `null` when no scan is running.
         *
         * Looked up through reflection by the torch plugin (`app.tauri.torch`): while a scan holds the
         * camera, Android rejects `CameraManager.setTorchMode`, so the flash must be driven through
         * this camera's `CameraControl` instead. Keep the name and signature stable.
         */
        @JvmStatic
        fun getActiveCamera(): Camera? = activeCamera
    }
}
