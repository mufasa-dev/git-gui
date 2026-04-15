use std::path::Path;
use serde::Serialize;
use walkdir::WalkDir;

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

#[derive(Serialize)]
pub struct TestFile {
    pub name: String,     // Ex: app.component.spec.ts
    pub path: String,     // Ex: src/app/app.component.spec.ts
    pub label: String,    // Ex: AppComponent (opcional, para exibir bonito)
}

#[tauri::command]
pub async fn get_project_test_files(project_path: String) -> Result<Vec<TestFile>, String> {
    let mut test_files = Vec::new();
    let src_path = format!("{}/src", project_path);

    for entry in WalkDir::new(src_path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() && path.to_string_lossy().contains(".spec.ts") {
            let full_path = path.to_str().unwrap().replace("\\", "/");
            let relative_path = full_path.replace(&project_path.replace("\\", "/"), "");
            let relative_clean = relative_path.trim_start_matches('/').to_string();

            test_files.push(TestFile {
                name: path.file_name().unwrap().to_string_lossy().into(),
                path: relative_clean,
                label: path.file_stem().unwrap().to_string_lossy().replace(".spec", ""),
            });
        }
    }
    Ok(test_files)
}