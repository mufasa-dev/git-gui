export type LocalChange = {
    path: string; 
    status: string; 
    staged: boolean;
    extension?: string;
}