use std::path::Path;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectType {
    pub framework: String, // "Angular", "React", "Go", "Dotnet", etc.
    pub test_runner: String, // "Karma", "Jest", "Vitest", "GoTest", etc.
}

#[tauri::command]
pub async fn detect_project_type(project_path: String) -> Result<ProjectType, String> {
    let path = Path::new(&project_path);
    
    // 1. Check Angular (package.json + angular.json)
    if path.join("angular.json").exists() {
        return Ok(ProjectType {
            framework: "Angular".into(),
            test_runner: "Karma/Jasmine".into(),
        });
    }

    // 2. Check Node/React/Svelte (package.json)
    if path.join("package.json").exists() {
        let content = std::fs::read_to_string(path.join("package.json")).unwrap_or_default();
        if content.contains("vitest") {
            return Ok(ProjectType { framework: "Vite".into(), test_runner: "Vitest".into() });
        }
        if content.contains("jest") {
            return Ok(ProjectType { framework: "React/Node".into(), test_runner: "Jest".into() });
        }
    }

    // 3. Check Go (go.mod)
    if path.join("go.mod").exists() {
        return Ok(ProjectType { framework: "Go".into(), test_runner: "GoTest".into() });
    }

    // 4. Check C# (Arquivos .csproj ou .sln)
    if std::fs::read_dir(path).map_err(|e| e.to_string())?
        .any(|entry| entry.ok().map_or(false, |e| e.file_name().to_string_lossy().ends_with(".csproj"))) {
        return Ok(ProjectType { framework: "Dotnet".into(), test_runner: "xUnit/NUnit".into() });
    }

    Ok(ProjectType {
        framework: "Unknown".into(),
        test_runner: "None".into(),
    })
}