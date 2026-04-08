use std::net::{Ipv4Addr, SocketAddr};
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::time::timeout;

/// Scan [start..=end] for hosts that accept a TCP connection on `port`.
/// Uses a fixed concurrency of 256 simultaneous probes.
pub async fn scan_range(
    start: Ipv4Addr,
    end: Ipv4Addr,
    port: u16,
    probe_timeout: Duration,
) -> Vec<String> {
    let start_u32 = u32::from(start);
    let end_u32 = u32::from(end);

    if start_u32 > end_u32 {
        return vec![];
    }

    let ips: Vec<Ipv4Addr> = (start_u32..=end_u32)
        .map(Ipv4Addr::from)
        .collect();

    const CONCURRENCY: usize = 256;
    let mut found = Vec::new();

    for chunk in ips.chunks(CONCURRENCY) {
        let handles: Vec<_> = chunk
            .iter()
            .map(|ip| {
                let ip = *ip;
                let addr = SocketAddr::new(ip.into(), port);
                tokio::spawn(async move {
                    if timeout(probe_timeout, TcpStream::connect(addr))
                        .await
                        .map(|r| r.is_ok())
                        .unwrap_or(false)
                    {
                        Some(ip.to_string())
                    } else {
                        None
                    }
                })
            })
            .collect();

        for handle in handles {
            if let Ok(Some(ip)) = handle.await {
                found.push(ip);
            }
        }
    }

    found
}
