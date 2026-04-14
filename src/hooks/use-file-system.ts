import { invoke } from "@tauri-apps/api/core";

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
}

export function useFileSystem() {
  const listDirectory = async (path: string): Promise<DirEntry[]> => {
    return invoke<DirEntry[]>("cmd_list_directory", { path });
  };

  const readFile = async (path: string): Promise<string> => {
    return invoke<string>("cmd_read_file", { path });
  };

  const writeFile = async (path: string, content: string): Promise<void> => {
    return invoke<void>("cmd_write_file", { path, content });
  };

  const renamePath = async (oldPath: string, newPath: string): Promise<void> => {
    return invoke<void>("cmd_rename_path", { oldPath, newPath });
  };

  const deletePath = async (path: string): Promise<void> => {
    return invoke<void>("cmd_delete_path", { path });
  };

  const copyPath = async (src: string, dst: string): Promise<void> => {
    return invoke<void>("cmd_copy_path", { src, dst });
  };

  return { listDirectory, readFile, writeFile, renamePath, deletePath, copyPath };
}
