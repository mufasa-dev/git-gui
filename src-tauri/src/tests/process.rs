use std::io;
use std::process::{Child, ChildStderr, ChildStdout, ExitStatus};
use std::sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

pub struct TrackedProcess {
    child: Mutex<Child>,
    stopped: AtomicBool,
}

pub type ProcessHandle = Arc<TrackedProcess>;

#[derive(Debug)]
pub struct ProcessResult {
    pub status: ExitStatus,
    pub stopped: bool,
}

static ACTIVE_PROCESS: OnceLock<Mutex<Option<ProcessHandle>>> = OnceLock::new();

fn active_process() -> &'static Mutex<Option<ProcessHandle>> {
    ACTIVE_PROCESS.get_or_init(|| Mutex::new(None))
}

pub fn track_child(child: Child) -> ProcessHandle {
    let process = Arc::new(TrackedProcess {
        child: Mutex::new(child),
        stopped: AtomicBool::new(false),
    });

    if let Ok(mut active) = active_process().lock() {
        *active = Some(process.clone());
    }

    process
}

pub fn take_stdout(process: &ProcessHandle) -> io::Result<Option<ChildStdout>> {
    process
        .child
        .lock()
        .map_err(|_| io::Error::other("process lock poisoned"))
        .map(|mut child| child.stdout.take())
}

pub fn take_stderr(process: &ProcessHandle) -> io::Result<Option<ChildStderr>> {
    process
        .child
        .lock()
        .map_err(|_| io::Error::other("process lock poisoned"))
        .map(|mut child| child.stderr.take())
}

pub fn wait_for_exit(process: &ProcessHandle) -> io::Result<ProcessResult> {
    loop {
        let result = {
            let mut child = process
                .child
                .lock()
                .map_err(|_| io::Error::other("process lock poisoned"))?;
            child.try_wait()?
        };

        if let Some(status) = result {
            return Ok(ProcessResult {
                status,
                stopped: process.stopped.load(Ordering::Acquire),
            });
        }

        thread::sleep(Duration::from_millis(50));
    }
}

pub fn clear_process(process: &ProcessHandle) {
    if let Ok(mut active) = active_process().lock() {
        if active
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, process))
        {
            *active = None;
        }
    }
}

fn terminate_child(process: &ProcessHandle) -> io::Result<()> {
    process.stopped.store(true, Ordering::Release);
    let mut child = process
        .child
        .lock()
        .map_err(|_| io::Error::other("process lock poisoned"))?;

    #[cfg(windows)]
    {
        let pid = child.id().to_string();
        let taskkill = std::process::Command::new("taskkill")
            .args(["/PID", &pid, "/T", "/F"])
            .status();
        if taskkill.map(|status| status.success()).unwrap_or(false) {
            return Ok(());
        }
    }

    child.kill()
}

#[tauri::command]
pub fn stop_test_execution() -> Result<String, String> {
    let process = active_process()
        .lock()
        .map_err(|_| "Não foi possível acessar o processo de testes".to_string())?
        .clone();

    match process {
        Some(process) => terminate_child(&process)
            .map(|_| "Execução de testes interrompida".to_string())
            .map_err(|error| format!("Não foi possível interromper os testes: {}", error)),
        None => Ok("Nenhuma execução de testes ativa".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{clear_process, stop_test_execution, track_child, wait_for_exit};
    use std::process::Command;

    #[test]
    fn stops_the_active_process() {
        let mut command = if cfg!(windows) {
            let mut command = Command::new("cmd.exe");
            command.args(["/C", "ping 127.0.0.1 -n 30 > nul"]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", "sleep 30"]);
            command
        };

        let process = track_child(command.spawn().expect("failed to spawn test process"));
        let message = stop_test_execution().expect("failed to stop test process");
        let result = wait_for_exit(&process).expect("failed to wait for test process");
        clear_process(&process);

        assert!(message.contains("interrompida") || message.contains("interrompido"));
        assert!(result.stopped);
    }
}
