//! Listens on the default mic and logs wake word detections: `ohren-listen path/to/x.wakeword [threshold]`
use ohren_runtime::{bundle::read_bundle, listen::listen};
use std::sync::{atomic::AtomicBool, Arc};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut args = std::env::args().skip(1);
    let path = args.next().ok_or("usage: ohren-listen <bundle.wakeword> [threshold]")?;
    let bundle = read_bundle(&std::fs::read(&path)?)?;
    let threshold = args.next().map(|t| t.parse()).transpose()?;
    let phrase = bundle.manifest.phrase.clone();
    listen(&bundle, threshold, Arc::new(AtomicBool::new(false)), |d| {
        println!("detected \"{phrase}\" score={:.2} t={:.1}s", d.score, d.t_secs)
    }, |_| {})
}
