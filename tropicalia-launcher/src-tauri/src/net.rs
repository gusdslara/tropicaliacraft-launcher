//! Rede da aba Servidores: ping real (Server List Ping do Java Edition) e descoberta de mundos/servidores na LAN.
//!
//! O ping sai do próprio aparelho, então a latência é a que o jogador vai ter de verdade.
//! A LAN usa o mesmo anúncio multicast do "Abrir para LAN" do Minecraft (224.0.2.60:4445).

use serde::Serialize;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpStream, UdpSocket};

const DEFAULT_PORT: u16 = 25565;
const TIMEOUT: Duration = Duration::from_secs(5);
/// Protocolo enviado no handshake. Servidores respondem ao status com qualquer valor.
const PROTOCOL: i32 = 769;

#[derive(Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PingResult {
    pub online: bool,
    pub latency_ms: Option<u32>,
    /// `description` cru do servidor (string ou componente JSON); o frontend converte para §.
    pub motd: Option<serde_json::Value>,
    pub favicon: Option<String>,
    pub players_online: Option<i64>,
    pub players_max: Option<i64>,
    pub sample: Vec<String>,
    pub version: Option<String>,
    pub protocol: Option<i64>,
    /// host:porta que realmente respondeu (depois do SRV).
    pub resolved: Option<String>,
    pub error: Option<String>,
}

fn write_varint(out: &mut Vec<u8>, value: i32) {
    let mut v = value as u32;
    loop {
        if v & !0x7f == 0 {
            out.push(v as u8);
            return;
        }
        out.push(((v & 0x7f) | 0x80) as u8);
        v >>= 7;
    }
}

async fn read_varint(stream: &mut TcpStream) -> Result<i32, String> {
    let mut value: u32 = 0;
    for i in 0..5 {
        let b = stream.read_u8().await.map_err(|e| format!("conexão encerrada: {e}"))?;
        value |= ((b & 0x7f) as u32) << (7 * i);
        if b & 0x80 == 0 {
            return Ok(value as i32);
        }
    }
    Err("VarInt inválido".into())
}

fn packet(id: i32, body: &[u8]) -> Vec<u8> {
    let mut inner = Vec::with_capacity(body.len() + 5);
    write_varint(&mut inner, id);
    inner.extend_from_slice(body);
    let mut out = Vec::with_capacity(inner.len() + 5);
    write_varint(&mut out, inner.len() as i32);
    out.extend_from_slice(&inner);
    out
}

/// `host`, `host:porta`, `[ipv6]:porta`. Devolve a porta só se ela foi escrita.
pub fn split_address(address: &str) -> (String, Option<u16>) {
    let a = address.trim().trim_end_matches('/');
    let a = a.strip_prefix("minecraft://").unwrap_or(a);
    if let Some(rest) = a.strip_prefix('[') {
        if let Some((host, tail)) = rest.split_once(']') {
            return (host.to_string(), tail.strip_prefix(':').and_then(|p| p.parse().ok()));
        }
    }
    match a.rsplit_once(':') {
        Some((host, port)) if !host.contains(':') => match port.parse() {
            Ok(p) => (host.to_string(), Some(p)),
            Err(_) => (a.to_string(), None),
        },
        _ => (a.to_string(), None),
    }
}

/// Registro SRV `_minecraft._tcp` por DNS-over-HTTPS (o mesmo que o jogo resolve antes de conectar).
async fn resolve_srv(client: &reqwest::Client, host: &str) -> Option<(String, u16)> {
    if host.parse::<IpAddr>().is_ok() || !host.contains('.') {
        return None;
    }
    #[derive(serde::Deserialize)]
    struct Answer {
        #[serde(rename = "type")]
        kind: u16,
        data: String,
    }
    #[derive(serde::Deserialize)]
    struct Doh {
        #[serde(rename = "Answer")]
        answer: Option<Vec<Answer>>,
    }
    let url = format!("https://dns.google/resolve?name=_minecraft._tcp.{host}&type=SRV");
    let res = client.get(url).timeout(Duration::from_secs(3)).send().await.ok()?;
    let doh: Doh = res.json().await.ok()?;
    let srv = doh.answer?.into_iter().find(|a| a.kind == 33)?;
    // "prioridade peso porta alvo."
    let parts: Vec<&str> = srv.data.split_whitespace().collect();
    let port: u16 = parts.get(2)?.parse().ok()?;
    let target = parts.get(3)?.trim_end_matches('.').to_string();
    (!target.is_empty()).then_some((target, port))
}

async fn status(host: &str, port: u16) -> Result<PingResult, String> {
    let started = Instant::now();
    let mut stream = tokio::time::timeout(TIMEOUT, TcpStream::connect((host, port)))
        .await
        .map_err(|_| "tempo esgotado".to_string())?
        .map_err(|e| format!("sem conexão: {e}"))?;
    let _ = stream.set_nodelay(true);
    let connect_ms = started.elapsed().as_millis() as u32;

    let mut hs = Vec::new();
    write_varint(&mut hs, PROTOCOL);
    write_varint(&mut hs, host.len() as i32);
    hs.extend_from_slice(host.as_bytes());
    hs.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut hs, 1);
    let mut out = packet(0x00, &hs);
    out.extend(packet(0x00, &[]));

    let body = tokio::time::timeout(TIMEOUT, async {
        stream.write_all(&out).await.map_err(|e| e.to_string())?;
        let len = read_varint(&mut stream).await?;
        if !(1..=4 * 1024 * 1024).contains(&len) {
            return Err("resposta inválida".to_string());
        }
        let mut buf = vec![0u8; len as usize];
        stream.read_exact(&mut buf).await.map_err(|e| e.to_string())?;
        Ok::<_, String>(buf)
    })
    .await
    .map_err(|_| "tempo esgotado".to_string())??;

    // id do pacote (VarInt) + tamanho da string (VarInt) + JSON
    let start = body.iter().position(|&b| b == b'{').ok_or("status sem JSON")?;
    let json: serde_json::Value = serde_json::from_slice(&body[start..]).map_err(|e| format!("JSON inválido: {e}"))?;

    // Ping/pong para medir a latência de ida e volta já com a conexão aberta.
    let mut latency = connect_ms;
    let t = Instant::now();
    let pong = tokio::time::timeout(Duration::from_secs(3), async {
        stream.write_all(&packet(0x01, &0x7470_6963_616cu64.to_be_bytes())).await.ok()?;
        let len = read_varint(&mut stream).await.ok()?;
        let mut buf = vec![0u8; len.clamp(0, 64) as usize];
        stream.read_exact(&mut buf).await.ok()?;
        Some(())
    })
    .await;
    if let Ok(Some(())) = pong {
        latency = t.elapsed().as_millis() as u32;
    }

    let players = &json["players"];
    Ok(PingResult {
        online: true,
        latency_ms: Some(latency.max(1)),
        motd: json.get("description").cloned(),
        favicon: json["favicon"].as_str().map(str::to_string),
        players_online: players["online"].as_i64(),
        players_max: players["max"].as_i64(),
        sample: players["sample"]
            .as_array()
            .map(|a| a.iter().filter_map(|p| p["name"].as_str().map(str::to_string)).take(12).collect())
            .unwrap_or_default(),
        version: json["version"]["name"].as_str().map(str::to_string),
        protocol: json["version"]["protocol"].as_i64(),
        resolved: Some(format!("{host}:{port}")),
        error: None,
    })
}

/// Ping de status do Minecraft: MOTD, ícone, jogadores, versão e latência real.
#[tauri::command]
pub async fn server_ping(state: tauri::State<'_, crate::AppState>, address: String) -> Result<PingResult, String> {
    let (host, port) = split_address(&address);
    if host.is_empty() {
        return Err("Endereço vazio".into());
    }
    let (host, port) = match port {
        Some(p) => (host, p),
        None => resolve_srv(&state.http, &host).await.unwrap_or((host, DEFAULT_PORT)),
    };
    Ok(status(&host, port).await.unwrap_or_else(|e| PingResult {
        online: false,
        resolved: Some(format!("{host}:{port}")),
        error: Some(e),
        ..Default::default()
    }))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LanServer {
    pub motd: String,
    pub address: String,
}

/// "[MOTD]Mundo do Fulano[/MOTD][AD]54321[/AD]"
pub fn parse_lan_announce(text: &str) -> Option<(String, String)> {
    let between = |open: &str, close: &str| -> Option<String> {
        let s = text.find(open)? + open.len();
        let e = text[s..].find(close)? + s;
        Some(text[s..e].to_string())
    };
    let motd = between("[MOTD]", "[/MOTD]").unwrap_or_else(|| "Mundo na LAN".into());
    let ad = between("[AD]", "[/AD]")?;
    Some((motd, ad.trim().to_string()))
}

/// Escuta os anúncios de LAN por `duration_ms` (o jogo anuncia a cada 1,5 s).
#[tauri::command]
pub async fn lan_scan(duration_ms: Option<u64>) -> Result<Vec<LanServer>, String> {
    let group = Ipv4Addr::new(224, 0, 2, 60);
    let socket = std::net::UdpSocket::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, 4445)))
        .or_else(|_| std::net::UdpSocket::bind(SocketAddr::from((Ipv4Addr::UNSPECIFIED, 0))))
        .map_err(|e| format!("Não foi possível escutar a LAN: {e}"))?;
    let mut joined = socket.join_multicast_v4(&group, &Ipv4Addr::UNSPECIFIED).is_ok();
    for ip in crate::server::local_ips() {
        if let Ok(IpAddr::V4(v4)) = ip.parse::<IpAddr>() {
            joined |= socket.join_multicast_v4(&group, &v4).is_ok();
        }
    }
    if !joined {
        return Err("A rede atual não aceita multicast (descoberta de LAN indisponível).".into());
    }
    socket.set_nonblocking(true).map_err(|e| e.to_string())?;
    let socket = UdpSocket::from_std(socket).map_err(|e| e.to_string())?;

    let deadline = Instant::now() + Duration::from_millis(duration_ms.unwrap_or(3200).clamp(500, 10_000));
    let mut found: Vec<LanServer> = Vec::new();
    let mut buf = [0u8; 1024];
    while let Some(left) = deadline.checked_duration_since(Instant::now()) {
        let Ok(Ok((n, from))) = tokio::time::timeout(left, socket.recv_from(&mut buf)).await else { break };
        let text = String::from_utf8_lossy(&buf[..n]);
        let Some((motd, ad)) = parse_lan_announce(&text) else { continue };
        // O anúncio traz só a porta (às vezes "ip:porta").
        let address = if ad.contains(':') { ad } else { format!("{}:{}", from.ip(), ad) };
        if !found.iter().any(|s| s.address == address) {
            found.push(LanServer { motd, address });
        }
    }
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_addresses() {
        assert_eq!(split_address("mc.exemplo.com"), ("mc.exemplo.com".into(), None));
        assert_eq!(split_address("mc.exemplo.com:25570"), ("mc.exemplo.com".into(), Some(25570)));
        assert_eq!(split_address("192.168.0.4:54321"), ("192.168.0.4".into(), Some(54321)));
        assert_eq!(split_address("[::1]:25565"), ("::1".into(), Some(25565)));
        assert_eq!(split_address(" host:abc "), ("host:abc".into(), None));
    }

    #[test]
    fn parses_lan_announce() {
        assert_eq!(
            parse_lan_announce("[MOTD]Gus - Mundo novo[/MOTD][AD]53122[/AD]"),
            Some(("Gus - Mundo novo".into(), "53122".into()))
        );
        assert_eq!(parse_lan_announce("lixo"), None);
    }

    #[test]
    fn varint_roundtrip_shape() {
        let mut v = Vec::new();
        write_varint(&mut v, 300);
        assert_eq!(v, vec![0xac, 0x02]);
        let mut v = Vec::new();
        write_varint(&mut v, -1);
        assert_eq!(v, vec![0xff, 0xff, 0xff, 0xff, 0x0f]);
    }
}
