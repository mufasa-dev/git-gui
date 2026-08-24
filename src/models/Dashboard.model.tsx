export interface CoverageStats {
    codeFiles: number,
    testFiles: number,
    otherFiles: number,
    percent: number,
}

export interface CodeChurnPoint {
    date: string,
    additions: number,
    deletions: number,
    commits: number,
}
