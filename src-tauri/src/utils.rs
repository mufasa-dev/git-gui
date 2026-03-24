use std::process::Command;
use tokio::process::Command as TokioCommand;

/// Função Síncrona (Standard)
pub fn git_command(path: &str) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new("git");
    
    cmd.arg("-C").arg(path);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    cmd
}

/// Função Assíncrona (Tokio)
pub fn git_command_async(path: &str) -> TokioCommand {
    #[allow(unused_mut)]
    let mut cmd = TokioCommand::new("git");
    
    cmd.arg("-C").arg(path);

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    cmd
}