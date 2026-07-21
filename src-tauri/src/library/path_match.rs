use crate::title::{clean_title_for_matching, normalize_title_key};
use std::path::Path;

pub(crate) fn normalize_fs_path(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

pub(crate) fn titles_match(a: &str, b: &str) -> bool {
    let a = normalize_title_key(&clean_title_for_matching(a));
    let b = normalize_title_key(&clean_title_for_matching(b));
    !a.is_empty() && !b.is_empty() && (a == b || a.starts_with(&b) || b.starts_with(&a))
}

pub(crate) fn same_or_under(child: &str, parent: &str) -> bool {
    let child = normalize_fs_path(child);
    let parent = normalize_fs_path(parent);
    !child.is_empty()
        && !parent.is_empty()
        && (child == parent || child.starts_with(&(parent + "/")))
}

fn path_component_depth(path: &str) -> usize {
    normalize_fs_path(path)
        .split('/')
        .filter(|part| !part.is_empty() && !part.ends_with(':'))
        .count()
}

/// Associa job ao item só por caminho (ou título + caminho relacionado).
/// Nunca só por título — isso apagava a fila inteira ao desinstalar um jogo.
pub(crate) fn job_matches(
    item_path: &str,
    item_title: &str,
    job_dest: &str,
    job_title: &str,
) -> bool {
    let item_path_n = normalize_fs_path(item_path);
    let job_dest_n = normalize_fs_path(job_dest);
    if item_path_n.is_empty() || job_dest_n.is_empty() {
        return false;
    }
    let titles = !item_title.trim().is_empty() && titles_match(item_title, job_title);

    // Mesmo destino exacto.
    if item_path_n == job_dest_n {
        return true;
    }

    // Item dentro da pasta do job (ex.: ficheiro dentro do dest do download).
    if item_path_n.starts_with(&(job_dest_n.clone() + "/")) {
        let folder = item_path_n.rsplit('/').next().unwrap_or("");
        return titles
            || titles_match(folder, job_title)
            || (!item_title.trim().is_empty() && titles_match(folder, item_title));
    }

    // Job dentro da pasta do item — exige título e path com profundidade mínima
    // (evita apagar todos os downloads se o item for a raiz D:/Downloads).
    if same_or_under(job_dest, item_path) {
        if path_component_depth(&item_path_n) < 2 {
            return false;
        }
        return titles;
    }

    false
}

pub(crate) fn same_path(a: &Path, b: &Path) -> bool {
    a == b || normalize_fs_path(&a.to_string_lossy()) == normalize_fs_path(&b.to_string_lossy())
}
