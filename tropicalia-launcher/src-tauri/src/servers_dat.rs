//! Garante o servidor oficial no `servers.dat` de cada instância (Java e Horizon/Rust).
//!
//! O arquivo é NBT sem compressão: `{servers: [{name, ip, icon?, acceptTextures?, hidden?}]}`.
//! Lemos a árvore inteira de forma genérica para preservar todos os outros campos e
//! entradas do jogador; só mexemos na entrada do servidor oficial, que fica sempre no topo.

use std::path::Path;

pub const OFFICIAL_NAME: &str = "TropicaliaCraft";
pub const OFFICIAL_ADDRESS: &str = "tropicaliacraft.gustavolara.pro";

#[derive(Clone, Debug, PartialEq)]
enum Tag {
    Byte(i8),
    Short(i16),
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    ByteArray(Vec<i8>),
    String(Vec<u8>),
    List(u8, Vec<Tag>),
    Compound(Vec<(Vec<u8>, Tag)>),
    IntArray(Vec<i32>),
    LongArray(Vec<i64>),
}

impl Tag {
    fn id(&self) -> u8 {
        match self {
            Tag::Byte(_) => 1,
            Tag::Short(_) => 2,
            Tag::Int(_) => 3,
            Tag::Long(_) => 4,
            Tag::Float(_) => 5,
            Tag::Double(_) => 6,
            Tag::ByteArray(_) => 7,
            Tag::String(_) => 8,
            Tag::List(..) => 9,
            Tag::Compound(_) => 10,
            Tag::IntArray(_) => 11,
            Tag::LongArray(_) => 12,
        }
    }
    fn get(&self, key: &str) -> Option<&Tag> {
        match self {
            Tag::Compound(entries) => entries.iter().find(|(k, _)| k == key.as_bytes()).map(|(_, v)| v),
            _ => None,
        }
    }
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
    depth: usize,
}

impl Reader<'_> {
    fn take(&mut self, n: usize) -> Option<&[u8]> {
        let end = self.pos.checked_add(n)?;
        let slice = self.data.get(self.pos..end)?;
        self.pos = end;
        Some(slice)
    }
    fn u8(&mut self) -> Option<u8> { self.take(1).map(|b| b[0]) }
    fn i16(&mut self) -> Option<i16> { self.take(2).map(|b| i16::from_be_bytes([b[0], b[1]])) }
    fn i32(&mut self) -> Option<i32> { self.take(4).map(|b| i32::from_be_bytes(b.try_into().unwrap())) }
    fn i64(&mut self) -> Option<i64> { self.take(8).map(|b| i64::from_be_bytes(b.try_into().unwrap())) }
    fn len(&mut self) -> Option<usize> { usize::try_from(self.i32()?).ok() }
    fn string(&mut self) -> Option<Vec<u8>> {
        let n = u16::from_be_bytes(self.take(2)?.try_into().ok()?) as usize;
        self.take(n).map(<[u8]>::to_vec)
    }
    fn payload(&mut self, id: u8) -> Option<Tag> {
        self.depth += 1;
        if self.depth > 512 { return None; }
        let tag = match id {
            1 => Tag::Byte(self.u8()? as i8),
            2 => Tag::Short(self.i16()?),
            3 => Tag::Int(self.i32()?),
            4 => Tag::Long(self.i64()?),
            5 => Tag::Float(f32::from_bits(self.i32()? as u32)),
            6 => Tag::Double(f64::from_bits(self.i64()? as u64)),
            7 => { let n = self.len()?; Tag::ByteArray(self.take(n)?.iter().map(|b| *b as i8).collect()) }
            8 => Tag::String(self.string()?),
            9 => {
                let item = self.u8()?;
                let n = self.len()?;
                let mut items = Vec::with_capacity(n.min(4096));
                for _ in 0..n { items.push(self.payload(item)?); }
                Tag::List(item, items)
            }
            10 => {
                let mut entries = Vec::new();
                loop {
                    let child = self.u8()?;
                    if child == 0 { break; }
                    let name = self.string()?;
                    entries.push((name, self.payload(child)?));
                }
                Tag::Compound(entries)
            }
            11 => { let n = self.len()?; let mut v = Vec::with_capacity(n.min(4096)); for _ in 0..n { v.push(self.i32()?); } Tag::IntArray(v) }
            12 => { let n = self.len()?; let mut v = Vec::with_capacity(n.min(4096)); for _ in 0..n { v.push(self.i64()?); } Tag::LongArray(v) }
            _ => return None,
        };
        self.depth -= 1;
        Some(tag)
    }
}

fn write_string(out: &mut Vec<u8>, s: &[u8]) {
    let n = s.len().min(u16::MAX as usize);
    out.extend_from_slice(&(n as u16).to_be_bytes());
    out.extend_from_slice(&s[..n]);
}

fn write_payload(out: &mut Vec<u8>, tag: &Tag) {
    match tag {
        Tag::Byte(v) => out.push(*v as u8),
        Tag::Short(v) => out.extend_from_slice(&v.to_be_bytes()),
        Tag::Int(v) => out.extend_from_slice(&v.to_be_bytes()),
        Tag::Long(v) => out.extend_from_slice(&v.to_be_bytes()),
        Tag::Float(v) => out.extend_from_slice(&v.to_bits().to_be_bytes()),
        Tag::Double(v) => out.extend_from_slice(&v.to_bits().to_be_bytes()),
        Tag::ByteArray(v) => { out.extend_from_slice(&(v.len() as i32).to_be_bytes()); out.extend(v.iter().map(|b| *b as u8)); }
        Tag::String(s) => write_string(out, s),
        Tag::List(item, items) => {
            let item = if items.is_empty() { *item } else { items[0].id() };
            out.push(item);
            out.extend_from_slice(&(items.len() as i32).to_be_bytes());
            for t in items { write_payload(out, t); }
        }
        Tag::Compound(entries) => {
            for (name, t) in entries {
                out.push(t.id());
                write_string(out, name);
                write_payload(out, t);
            }
            out.push(0);
        }
        Tag::IntArray(v) => { out.extend_from_slice(&(v.len() as i32).to_be_bytes()); for x in v { out.extend_from_slice(&x.to_be_bytes()); } }
        Tag::LongArray(v) => { out.extend_from_slice(&(v.len() as i32).to_be_bytes()); for x in v { out.extend_from_slice(&x.to_be_bytes()); } }
    }
}

/// Endereço normalizado: minúsculo e com a porta 25565 explícita quando ausente.
fn address_key(ip: &str) -> String {
    let ip = ip.trim().to_ascii_lowercase();
    if ip.rsplit_once(':').is_some_and(|(_, p)| p.parse::<u16>().is_ok()) { ip } else { format!("{ip}:25565") }
}

fn official_entry() -> Tag {
    Tag::Compound(vec![
        (b"name".to_vec(), Tag::String(OFFICIAL_NAME.as_bytes().to_vec())),
        (b"ip".to_vec(), Tag::String(OFFICIAL_ADDRESS.as_bytes().to_vec())),
        (b"acceptTextures".to_vec(), Tag::Byte(1)),
    ])
}

/// Retorna o conteúdo novo do servers.dat com o servidor oficial no topo, ou `None`
/// se o arquivo já está assim. Um arquivo ilegível é substituído por uma lista nova.
fn ensure_bytes(existing: Option<&[u8]>) -> Option<Vec<u8>> {
    let parsed = existing.and_then(|data| {
        let mut r = Reader { data, pos: 0, depth: 0 };
        if r.u8()? != 10 { return None; }
        let name = r.string()?;
        Some((name, r.payload(10)?))
    });
    let (root_name, mut root) = parsed.unwrap_or_else(|| (Vec::new(), Tag::Compound(Vec::new())));
    let Tag::Compound(entries) = &mut root else { unreachable!() };
    if !entries.iter().any(|(k, _)| k == b"servers") {
        entries.push((b"servers".to_vec(), Tag::List(10, Vec::new())));
    }
    let servers = entries.iter_mut().find(|(k, _)| k == b"servers").map(|(_, v)| v).unwrap();
    if !matches!(servers, Tag::List(..)) { *servers = Tag::List(10, Vec::new()); }
    let Tag::List(item, list) = servers else { unreachable!() };
    if !list.is_empty() && *item != 10 { list.clear(); }
    *item = 10;

    let official = address_key(OFFICIAL_ADDRESS);
    let is_official = |t: &Tag| match t.get("ip") {
        Some(Tag::String(ip)) => address_key(&String::from_utf8_lossy(ip)) == official,
        _ => false,
    };
    let hidden = |t: &Tag| matches!(t.get("hidden"), Some(Tag::Byte(1)));
    // Já está certo: a primeira entrada visível é o oficial e não há duplicatas.
    let visible_first = list.iter().find(|t| !hidden(t));
    if visible_first.is_some_and(|t| is_official(t)) && list.iter().filter(|t| is_official(t)).count() == 1 {
        return None;
    }
    // Mantém o nome/ícone que o jogador já tinha para a entrada oficial, se houver.
    let mut entry = list.iter().find(|t| is_official(t) && !hidden(t)).cloned().unwrap_or_else(official_entry);
    if let Tag::Compound(fields) = &mut entry {
        fields.retain(|(k, _)| k != b"hidden");
    }
    list.retain(|t| !is_official(t));
    list.insert(0, entry);

    let mut out = Vec::new();
    out.push(10);
    write_string(&mut out, &root_name);
    write_payload(&mut out, &root);
    Some(out)
}

/// Coloca o servidor oficial no topo do `servers.dat` em `dir`, preservando o resto.
pub fn ensure_official_server(dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let file = dir.join("servers.dat");
    let existing = std::fs::read(&file).ok();
    if let Some(bytes) = ensure_bytes(existing.as_deref()) {
        let tmp = dir.join("servers.dat.tropicalia-tmp");
        std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn servers(bytes: &[u8]) -> Vec<String> {
        let mut r = Reader { data: bytes, pos: 0, depth: 0 };
        assert_eq!(r.u8(), Some(10));
        r.string().unwrap();
        let root = r.payload(10).unwrap();
        let Some(Tag::List(_, list)) = root.get("servers") else { panic!() };
        list.iter()
            .map(|t| match t.get("ip") { Some(Tag::String(s)) => String::from_utf8_lossy(s).into_owned(), _ => String::new() })
            .collect()
    }

    #[test]
    fn creates_list_when_missing() {
        let out = ensure_bytes(None).unwrap();
        assert_eq!(servers(&out), vec![OFFICIAL_ADDRESS]);
        assert!(ensure_bytes(Some(&out)).is_none(), "idempotente");
    }

    #[test]
    fn moves_official_to_top_and_keeps_others() {
        let other = Tag::Compound(vec![
            (b"name".to_vec(), Tag::String(b"Outro".to_vec())),
            (b"ip".to_vec(), Tag::String(b"mc.example.com".to_vec())),
            (b"icon".to_vec(), Tag::String(b"abc".to_vec())),
        ]);
        let mut off = official_entry();
        if let Tag::Compound(f) = &mut off { f[0].1 = Tag::String(b"Meu nome".to_vec()); f[1].1 = Tag::String(b"TropicaliaCraft.gustavolara.pro:25565".to_vec()); }
        let root = Tag::Compound(vec![(b"servers".to_vec(), Tag::List(10, vec![other.clone(), off]))]);
        let mut bytes = vec![10];
        write_string(&mut bytes, b"");
        write_payload(&mut bytes, &root);
        let out = ensure_bytes(Some(&bytes)).unwrap();
        assert_eq!(servers(&out), vec!["TropicaliaCraft.gustavolara.pro:25565", "mc.example.com"]);
    }

    #[test]
    fn garbage_is_replaced() {
        let out = ensure_bytes(Some(b"not nbt")).unwrap();
        assert_eq!(servers(&out), vec![OFFICIAL_ADDRESS]);
    }
}
