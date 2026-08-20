use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestRunnerOption {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub framework: String,
    pub target_path: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectType {
    pub framework: String,
    pub test_runner: String,
    pub runners: Vec<TestRunnerOption>,
}

fn option(
    id: &str,
    label: &str,
    kind: &str,
    framework: &str,
    target_path: Option<String>,
) -> TestRunnerOption {
    TestRunnerOption {
        id: id.to_string(),
        label: label.to_string(),
        kind: kind.to_string(),
        framework: framework.to_string(),
        target_path,
    }
}

fn package_has(package: &Value, package_name: &str) -> bool {
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]
        .iter()
        .any(|section| package[*section].get(package_name).is_some())
}

fn package_scripts_contain(package: &Value, value: &str) -> bool {
    package["scripts"]
        .as_object()
        .map(|scripts| {
            scripts
                .values()
                .filter_map(Value::as_str)
                .any(|script| script.to_lowercase().contains(value))
        })
        .unwrap_or(false)
}

fn relative_target(project_path: &Path, target: &Path) -> Option<String> {
    target
        .strip_prefix(project_path)
        .ok()
        .map(|path| path.to_string_lossy().replace('\\', "/"))
}

fn dotnet_frameworks(content: &str) -> Vec<(&'static str, &'static str)> {
    let lower = content.to_lowercase();
    let mut frameworks = Vec::new();

    if lower.contains("xunit") {
        frameworks.push(("xunit", "xUnit"));
    }
    if lower.contains("nunit") {
        frameworks.push(("nunit", "NUnit"));
    }
    if lower.contains("mstest") {
        frameworks.push(("mstest", "MSTest"));
    }

    frameworks
}

fn detect_dotnet_runners(project_path: &Path) -> Vec<TestRunnerOption> {
    let mut runners = Vec::new();
    let mut found_solution = None;

    for entry in WalkDir::new(project_path)
        .max_depth(4)
        .into_iter()
        .filter_entry(|entry| {
            !entry.path().components().any(|component| {
                matches!(component.as_os_str().to_str(), Some(".git" | "bin" | "obj" | "node_modules"))
            })
        })
        .filter_map(Result::ok)
    {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_lowercase();

        if name.ends_with(".sln") && found_solution.is_none() {
            found_solution = Some(path.to_path_buf());
        }

        if !name.ends_with(".csproj") {
            continue;
        }

        let content = fs::read_to_string(path).unwrap_or_default();
        let frameworks = dotnet_frameworks(&content);
        let target_path = relative_target(project_path, path);
        let project_name = path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or(".NET project");
        let looks_like_test_project = name.contains("test") || !frameworks.is_empty();

        if !looks_like_test_project {
            continue;
        }

        if frameworks.is_empty() {
            runners.push(option(
                &format!("dotnet:{}", target_path.as_deref().unwrap_or(project_name)),
                &format!("dotnet test — {}", project_name),
                "dotnet",
                "Dotnet",
                target_path,
            ));
        } else {
            for (id, label) in frameworks {
                runners.push(option(
                    &format!("dotnet:{}:{}", id, target_path.as_deref().unwrap_or(project_name)),
                    &format!("{} — {}", label, project_name),
                    "dotnet",
                    "Dotnet",
                    target_path.clone(),
                ));
            }
        }
    }

    if runners.is_empty() {
        if let Some(solution) = found_solution {
            let target_path = relative_target(project_path, &solution);
            runners.push(option(
                &format!("dotnet:{}", target_path.as_deref().unwrap_or("solution")),
                &format!("dotnet test — {}", solution.file_name().unwrap_or_default().to_string_lossy()),
                "dotnet",
                "Dotnet",
                target_path,
            ));
        }
    }

    runners
}

fn detect_runners(project_path: &Path) -> Vec<TestRunnerOption> {
    let mut runners = Vec::new();
    let package_path = project_path.join("package.json");
    let package = fs::read_to_string(&package_path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok());

    if project_path.join("angular.json").exists() {
        runners.push(option(
            "angular-karma",
            "Karma/Jasmine",
            "angular",
            "Angular",
            None,
        ));
    }

    if let Some(package) = package.as_ref() {
        let has_vitest_config = ["vitest.config.ts", "vitest.config.js", "vitest.config.mts", "vitest.config.mjs"]
            .iter()
            .any(|file| project_path.join(file).exists());
        if package_has(package, "vitest") || package_scripts_contain(package, "vitest") || has_vitest_config {
            runners.push(option("vitest", "Vitest", "vitest", "Vitest", None));
        }
        if package_has(package, "jest") || package_scripts_contain(package, "jest") {
            runners.push(option("jest", "Jest", "jest", "React/Node", None));
        }
    }

    if project_path.join("go.mod").exists() {
        runners.push(option("go-test", "GoTest", "go", "Go", None));
    }

    let cargo_manifest = if project_path.join("src-tauri/Cargo.toml").exists() {
        Some(project_path.join("src-tauri/Cargo.toml"))
    } else if project_path.join("Cargo.toml").exists() {
        Some(project_path.join("Cargo.toml"))
    } else {
        None
    };
    if let Some(manifest) = cargo_manifest {
        runners.push(option(
            "rust-cargo",
            "Cargo test",
            "rust",
            "Rust",
            relative_target(project_path, &manifest),
        ));
    }

    runners.extend(detect_dotnet_runners(project_path));
    runners
}

#[tauri::command]
pub async fn detect_project_type(project_path: String) -> Result<ProjectType, String> {
    let path = PathBuf::from(&project_path);
    let runners = detect_runners(&path);

    if let Some(first) = runners.first() {
        return Ok(ProjectType {
            framework: first.framework.clone(),
            test_runner: first.label.clone(),
            runners,
        });
    }

    Ok(ProjectType {
        framework: "Unknown".into(),
        test_runner: "None".into(),
        runners,
    })
}

#[cfg(test)]
mod tests {
    use super::{detect_runners, dotnet_frameworks};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_project() -> std::path::PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("devbrook-test-{}", suffix));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn detects_frontend_and_rust_runners_in_tauri() {
        let path = temporary_project();
        fs::write(path.join("package.json"), r#"{"devDependencies":{"vitest":"^3.0.0"}}"#).unwrap();
        fs::create_dir_all(path.join("src-tauri")).unwrap();
        fs::write(path.join("src-tauri/Cargo.toml"), "[package]\nname = \"sample\"\n").unwrap();

        let runners = detect_runners(&path);
        let ids: Vec<&str> = runners.iter().map(|runner| runner.id.as_str()).collect();
        assert_eq!(ids, vec!["vitest", "rust-cargo"]);

        fs::remove_dir_all(path).unwrap();
    }

    #[test]
    fn detects_dotnet_frameworks() {
        let frameworks = dotnet_frameworks(
            "<PackageReference Include=\"Microsoft.NET.Test.Sdk\" />\n<PackageReference Include=\"xunit\" />",
        );
        assert_eq!(frameworks, vec![("xunit", "xUnit")]);
    }
}
