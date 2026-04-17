use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;


pub struct PtyInstance {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

pub struct PtyManager {
    instances: Arc<Mutex<HashMap<String, PtyInstance>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn spawn_pty(
        &self,
        id: String,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
        shell: Option<String>,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };

        let pair = pty_system
            .openpty(size)
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let shell_path = shell.unwrap_or_else(|| {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
        });

        let mut cmd = CommandBuilder::new(&shell_path);
        cmd.arg("-l");
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        if let Some(dir) = cwd {
            cmd.cwd(dir);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

        let instance = PtyInstance {
            master: pair.master,
            writer,
            _child: child,
        };

        self.instances.lock().insert(id.clone(), instance);
        Ok(id)
    }

    pub fn write_to_pty(&self, id: &str, data: &str) -> Result<(), String> {
        let mut instances = self.instances.lock();
        let instance = instances
            .get_mut(id)
            .ok_or_else(|| format!("PTY not found: {}", id))?;
        instance
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;
        instance
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;
        Ok(())
    }

    pub fn resize_pty(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let instances = self.instances.lock();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("PTY not found: {}", id))?;
        instance
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))?;
        Ok(())
    }

    pub fn kill_pty(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock();
        instances
            .remove(id)
            .ok_or_else(|| format!("PTY not found: {}", id))?;
        Ok(())
    }

    pub fn take_reader(
        &self,
        id: &str,
    ) -> Result<Box<dyn Read + Send>, String> {
        let instances = self.instances.lock();
        let instance = instances
            .get(id)
            .ok_or_else(|| format!("PTY not found: {}", id))?;
        instance
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))
    }
}
