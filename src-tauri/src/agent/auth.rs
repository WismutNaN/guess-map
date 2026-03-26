use rand::RngCore;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;

pub fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);

    let mut token = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        use std::fmt::Write as _;
        let _ = write!(&mut token, "{:02x}", b);
    }
    token
}

pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    let digest = hasher.finalize();
    format!("{:x}", digest)
}

pub fn verify_token(expected_hash: &str, provided_token: &str) -> bool {
    let provided_hash = hash_token(provided_token);
    expected_hash
        .as_bytes()
        .ct_eq(provided_hash.as_bytes())
        .into()
}

pub fn parse_bearer_token(header_value: &str) -> Option<&str> {
    let mut parts = header_value.splitn(2, ' ');
    match (parts.next(), parts.next()) {
        (Some(scheme), Some(token)) if scheme.eq_ignore_ascii_case("Bearer") => {
            let trimmed = token.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_token() {
        let token = "secret-token";
        let hash = hash_token(token);

        assert!(verify_token(&hash, token));
        assert!(!verify_token(&hash, "wrong-token"));
    }
}
