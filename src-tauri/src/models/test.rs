use serde::Serialize;

#[derive(Serialize)]
pub struct TestCase {
    pub name: String,      // O texto dentro do 'it'
    pub suite: String,     // O texto do 'describe' pai
}

#[derive(Serialize)]
pub struct TestFile {
    pub name: String,
    pub path: String,
    pub label: String,
    pub tests: Vec<TestCase>,
}