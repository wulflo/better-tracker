#[cfg(target_os = "android")]
use jni::objects::{JClass, JObject, JValue};
#[cfg(target_os = "android")]
use jni::{JNIEnv, JavaVM};

#[cfg(target_os = "android")]
pub fn multicast_acquire() {
    let ctx = ndk_context::android_context();
    // SAFETY: ndk_context provides valid VM/context for the process lifetime.
    let vm = match unsafe { JavaVM::from_raw(ctx.vm().cast()) } { Ok(v) => v, Err(_) => return };
    let mut env = match vm.attach_current_thread() { Ok(e) => e, Err(_) => return };
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let loader = match env.call_method(&context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[]) {
        Ok(v) => match v.l() { Ok(o) => o, _ => return },
        Err(_) => return,
    };
    let name = match env.new_string("com.bettertracker.desktop.Multicast") { Ok(s) => s, Err(_) => return };
    let class_obj = match env.call_method(&loader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;", &[JValue::Object(&name)]) {
        Ok(v) => match v.l() { Ok(o) => o, _ => return },
        Err(_) => return,
    };
    let _ = env.call_static_method(
        &jni::objects::JClass::from(class_obj),
        "acquire",
        "(Landroid/content/Context;)V",
        &[JValue::Object(&context)],
    );
}

#[cfg(target_os = "android")]
pub fn multicast_release() {
    // Best-effort: load class and call release().
    let ctx = ndk_context::android_context();
    let vm = match unsafe { JavaVM::from_raw(ctx.vm().cast()) } { Ok(v) => v, Err(_) => return };
    let mut env = match vm.attach_current_thread() { Ok(e) => e, Err(_) => return };
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };
    let loader = match env.call_method(&context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[]) {
        Ok(v) => match v.l() { Ok(o) => o, _ => return },
        Err(_) => return,
    };
    let name = match env.new_string("com.bettertracker.desktop.Multicast") { Ok(s) => s, Err(_) => return };
    let class_obj = match env.call_method(&loader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;", &[JValue::Object(&name)]) {
        Ok(v) => match v.l() { Ok(o) => o, _ => return },
        Err(_) => return,
    };
    let _ = env.call_static_method(
        &jni::objects::JClass::from(class_obj),
        "release",
        "()V",
        &[],
    );
}

#[cfg(target_os = "android")]
pub fn battery_info() -> (bool, i32, bool) {
    // Minimal fallback; real implementation would query PowerManager/BatteryManager.
    (false, 100, true)
}

#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn Java_com_bettertracker_desktop_NativeBridge_backgroundSync(
    mut env: JNIEnv,
    _class: JClass,
    context: JObject,
) -> i32 {
    // Resolve Tauri's app data dir from the Android Context (getFilesDir).
    let files_dir = match env.call_method(&context, "getFilesDir", "()Ljava/io/File;", &[]) {
        Ok(v) => match v.l() { Ok(o) => o, _ => return 1 },
        Err(_) => return 1,
    };
    let path_obj = match env.call_method(&files_dir, "getAbsolutePath", "()Ljava/lang/String;", &[]) {
        Ok(v) => match v.l() { Ok(o) => o, _ => return 1 },
        Err(_) => return 1,
    };
    let root: String = match env.get_string(&jni::objects::JString::from(path_obj)) {
        Ok(s) => s.into(),
        Err(_) => return 1,
    };

    let rt = match tokio::runtime::Runtime::new() {
        Ok(r) => r,
        Err(_) => return 1,
    };
    match rt.block_on(crate::sync::manager::SyncManager::run_background_sync(root)) {
        Ok(_) => 0,
        Err(_) => 1,
    }
}

// Non-android stubs so callers compile.
#[cfg(not(target_os = "android"))]
pub fn multicast_acquire() {}
#[cfg(not(target_os = "android"))]
pub fn multicast_release() {}
#[cfg(not(target_os = "android"))]
pub fn battery_info() -> (bool, i32, bool) {
    (false, 100, true)
}