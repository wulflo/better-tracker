// Test de instrumentación de la copia local del plugin.
// Comprueba que el ML Kit empaquetado (sin Google Play Services) decodifica un
// EAN-13 desde un bitmap, que es lo que hace `BarcodeScannerPlugin.analyze`.
package app.tauri.barcodescanner

import android.graphics.BitmapFactory
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class BarcodeDecodingTest {
    @Test
    fun decodesEan13WithoutPlayServices() {
        val context = InstrumentationRegistry.getInstrumentation().context
        val bitmap = context.assets.open("ean13.png").use { BitmapFactory.decodeStream(it) }
        val scanner = BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_EAN_13)
                .build()
        )

        val latch = CountDownLatch(1)
        var decoded: String? = null
        var failure: Exception? = null
        scanner.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener { barcodes -> decoded = barcodes.firstOrNull()?.rawValue }
            .addOnFailureListener { failure = it }
            .addOnCompleteListener { latch.countDown() }

        latch.await(30, TimeUnit.SECONDS)
        assertEquals("7501055300013", decoded)
        assertEquals(null, failure?.message)
    }
}
