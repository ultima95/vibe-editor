use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub score: u32,
}

#[derive(Debug, Serialize, Clone)]
pub struct TextSearchResult {
    pub path: String,
    pub line_number: u32,
    pub line_content: String,
    pub match_start: u32,
    pub match_end: u32,
}

fn should_skip(name: &str) -> bool {
    name.starts_with('.')
        || name == "node_modules"
        || name == "target"
        || name == "dist"
        || name == ".git"
}

fn subsequence_score(query: &str, haystack: &str) -> Option<u32> {
    if query.is_empty() {
        return Some(0);
    }

    let query_lower: Vec<char> = query.to_lowercase().chars().collect();
    let haystack_lower: Vec<char> = haystack.to_lowercase().chars().collect();
    let haystack_chars: Vec<char> = haystack.chars().collect();

    let mut score: u32 = 0;
    let mut qi = 0;
    let mut prev_match_idx: Option<usize> = None;

    for (hi, &hc) in haystack_lower.iter().enumerate() {
        if qi < query_lower.len() && hc == query_lower[qi] {
            score += 1;

            // Consecutive match bonus
            if let Some(prev) = prev_match_idx {
                if hi == prev + 1 {
                    score += 5;
                }
            }

            // Word boundary bonus (start of string, after '.', '_', '-', '/')
            if hi == 0
                || matches!(
                    haystack_chars.get(hi.wrapping_sub(1)),
                    Some('.' | '_' | '-' | '/')
                )
                || (haystack_chars[hi].is_uppercase() && hi > 0 && haystack_chars[hi - 1].is_lowercase())
            {
                score += 3;
            }

            prev_match_idx = Some(hi);
            qi += 1;
        }
    }

    if qi == query_lower.len() {
        // Bonus for shorter filenames (exact or near-exact matches rank higher)
        score += (100u32).saturating_sub(haystack.len() as u32);
        Some(score)
    } else {
        None
    }
}

pub fn fuzzy_search(query: &str, root: &str, limit: usize) -> Result<Vec<SearchResult>, String> {
    let root_path = Path::new(root);
    if !root_path.exists() {
        return Err(format!("Root path does not exist: {}", root));
    }

    let mut results: Vec<SearchResult> = Vec::new();

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0 || !should_skip(&e.file_name().to_string_lossy())
        })
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();
        let rel_path = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();
        let name = entry.file_name().to_string_lossy().to_string();

        if query.is_empty() {
            results.push(SearchResult {
                path: rel_path,
                name,
                score: 0,
            });
            if results.len() >= limit {
                break;
            }
        } else if let Some(score) = subsequence_score(query, &name) {
            results.push(SearchResult {
                path: rel_path,
                name,
                score,
            });
        }
    }

    if !query.is_empty() {
        results.sort_by(|a, b| b.score.cmp(&a.score));
        results.truncate(limit);
    }

    Ok(results)
}

pub fn text_search(
    query: &str,
    root: &str,
    limit: usize,
) -> Result<Vec<TextSearchResult>, String> {
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let root_path = Path::new(root);
    if !root_path.exists() {
        return Err(format!("Root path does not exist: {}", root));
    }

    let query_lower = query.to_lowercase();
    let mut results: Vec<TextSearchResult> = Vec::new();

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(|e| {
            e.depth() == 0 || !should_skip(&e.file_name().to_string_lossy())
        })
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_dir() {
            continue;
        }

        if results.len() >= limit {
            break;
        }

        let path = entry.path();
        let rel_path = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .to_string();

        let file = match fs::File::open(path) {
            Ok(f) => f,
            Err(_) => continue,
        };

        let reader = BufReader::new(file);
        for (line_idx, line_result) in reader.lines().enumerate() {
            let line = match line_result {
                Ok(l) => l,
                Err(_) => break, // likely binary file
            };

            let line_lower = line.to_lowercase();
            if let Some(pos) = line_lower.find(&query_lower) {
                results.push(TextSearchResult {
                    path: rel_path.clone(),
                    line_number: (line_idx + 1) as u32,
                    line_content: line,
                    match_start: pos as u32,
                    match_end: (pos + query.len()) as u32,
                });

                if results.len() >= limit {
                    break;
                }
            }
        }
    }

    Ok(results)
}
