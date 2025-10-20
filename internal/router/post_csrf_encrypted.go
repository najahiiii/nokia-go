package router

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func (c *Client) PostCSRFEncrypted(
	ctx context.Context,
	endpoint string,
	session *LoginSession,
	plaintext string,
) (map[string]interface{}, error) {
	if session == nil || session.SID == "" {
		return nil, fmt.Errorf("no session: SID empty")
	}
	if session.PubKey == "" {
		return nil, fmt.Errorf("no pubkey in session")
	}

	body, err := c.prepareEncryptedPayload(session, plaintext)
	if err != nil {
		return nil, err
	}

	if ctx == nil {
		ctx = context.Background()
	}
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(c.baseURL, "/")+"/"+endpoint,
		strings.NewReader(body),
	)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Cookie", "sid="+session.SID)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("http %d: %s", resp.StatusCode, string(respBody))
	}

	var out map[string]interface{}
	if err := json.Unmarshal(respBody, &out); err != nil {
		return map[string]interface{}{"raw": string(respBody)}, nil
	}
	return out, nil
}

func (c *Client) prepareEncryptedPayload(session *LoginSession, plaintext string) (string, error) {
	if session != nil && session.Token != "" {
		const key = "csrf_token="
		if idx := strings.Index(plaintext, key); idx >= 0 {
			start := idx + len(key)
			endRel := strings.IndexByte(plaintext[start:], '&')
			end := len(plaintext)
			if endRel >= 0 {
				end = start + endRel
			}
			current := plaintext[start:end]
			if strings.TrimSpace(current) == "" {
				escaped := url.QueryEscape(session.Token)
				plaintext = plaintext[:start] + escaped + plaintext[end:]
			}
		} else {
			if plaintext != "" && !strings.HasSuffix(plaintext, "&") {
				plaintext += "&"
			}
			plaintext += "csrf_token=" + url.QueryEscape(session.Token)
		}
	}

	ct, ck, err := encryptPostData(session.PubKey, plaintext)
	if err != nil {
		return "", fmt.Errorf("encrypt payload: %w", err)
	}

	return "encrypted=1&ct=" + ct + "&ck=" + ck, nil
}

func encryptPostData(pubkeyPEM, body string) (string, string, error) {
	rsaPub, err := parseRSAPublicKeyFlexible(pubkeyPEM)
	if err != nil {
		return "", "", fmt.Errorf("pubkey: %w", err)
	}

	key := make([]byte, 16)
	if _, err := rand.Read(key); err != nil {
		return "", "", err
	}
	iv := make([]byte, 16)
	if _, err := rand.Read(iv); err != nil {
		return "", "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", "", err
	}

	padded := pkcs7Pad([]byte(body), aes.BlockSize)
	ctRaw := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(ctRaw, padded)

	ckPlain := b64Std(key) + " " + b64Std(iv)
	ckRaw, err := rsa.EncryptPKCS1v15(rand.Reader, rsaPub, []byte(ckPlain))
	if err != nil {
		return "", "", fmt.Errorf("rsa pkcs1v15: %w", err)
	}

	return b64urlRaw(ctRaw), b64urlDot(ckRaw), nil
}

func pkcs7Pad(in []byte, block int) []byte {
	p := block - (len(in) % block)
	return append(in, bytes.Repeat([]byte{byte(p)}, p)...)
}

func b64urlRaw(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func b64Std(b []byte) string {
	return base64.StdEncoding.EncodeToString(b)
}

func b64urlDot(b []byte) string {
	s := base64.StdEncoding.EncodeToString(b)
	s = strings.ReplaceAll(s, "+", "-")
	s = strings.ReplaceAll(s, "/", "_")
	s = strings.ReplaceAll(s, "=", ".")
	return s
}

func parseRSAPublicKeyFlexible(pemStr string) (*rsa.PublicKey, error) {
	if block, _ := pem.Decode([]byte(pemStr)); block != nil {
		if pub, err := x509.ParsePKIXPublicKey(block.Bytes); err == nil {
			if k, ok := pub.(*rsa.PublicKey); ok {
				return k, nil
			}
		}
		if k, err := x509.ParsePKCS1PublicKey(block.Bytes); err == nil {
			return k, nil
		}
	}

	const head = "-----BEGIN PUBLIC KEY-----"
	const foot = "-----END PUBLIC KEY-----"

	i := strings.Index(pemStr, head)
	j := strings.Index(pemStr, foot)
	if i == -1 || j == -1 || j <= i+len(head) {
		return nil, errors.New("invalid public key")
	}

	b64 := strings.TrimSpace(pemStr[i+len(head) : j])
	b64 = strings.ReplaceAll(b64, "\r", "")
	b64 = strings.ReplaceAll(b64, "\n", "")
	b64 = strings.ReplaceAll(b64, " ", "")

	der, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, err
	}

	if pub, err := x509.ParsePKIXPublicKey(der); err == nil {
		if k, ok := pub.(*rsa.PublicKey); ok {
			return k, nil
		}
	}
	if k, err := x509.ParsePKCS1PublicKey(der); err == nil {
		return k, nil
	}

	return nil, errors.New("unsupported public key")
}
