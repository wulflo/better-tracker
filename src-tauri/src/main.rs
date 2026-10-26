// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Process --version at the very beginning of main, before creating any
    // window or touching the network. Prints the embedded version and exits.
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--version" || a == "-V") {
        println!("{}", better_tracker_lib::version::VERSION);
        return;
    }

    better_tracker_lib::run();
}