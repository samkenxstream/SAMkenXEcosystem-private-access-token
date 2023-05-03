import { PrivateStateTokenIssuer, IssueRequest, RedeemRequest } from "../../src/private-state-token.js";

const CLOUDFLARE_PUB_KEY = "MIIBUjA9BgkqhkiG9w0BAQowMKANMAsGCWCGSAFlAwQCAqEaMBgGCSqGSIb3DQEBCDALBglghkgBZQMEAgKiAwIBMAOCAQ8AMIIBCgKCAQEAn23qyGdHVs28an7XXJsPKj7kVCaC9GVfIA_hqz7TYAdgPPPWwl9HHr2M2TPFejyc6bFISKBkmpvDiLNyAvKEm13RN65hHys38F97m-W3nV3CX88cMDzDhHNeSKqQo1MoCrKUVRA-HzoI7whFpb6oZatrsiQfT6e0EDSrkJ6AGKwW_hqtTq7Q8oQ8NMvLvQL4MtSLPzPcvwFOz2xb4cnOAAux7Xqj_X9nqx6jEU9gIxdjYa3s0NPyqM-bXlYDhp2Sss_2cyjfmadXK8iNYTmz68Ee9rJbH-kOjl28L1MjBPE6_7T93xkwiDUx1oIe6PkSyh1uv2wJROfbRBP3WttzJwIDAQAB";
const CHALLENGE = "AAIAGXBhdC1pc3N1ZXIuY2xvdWRmbGFyZS5jb20AAAA=";
let issuer;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (!issuer) issuer = PrivateStateTokenIssuer.generate(`https://${request.headers.get("host")}/`, 10);
        if (url.pathname === "/pst/k") {
            const body = issuer.keyCommitment.toString();
            return new Response(body, {
                status: 200,
                headers: { "Content-Type": "text/json" },
            });
        }
        else if (url.pathname === "/pst/i") {
            const privateStateToken = request.headers.get("sec-private-state-token");

            if (privateStateToken) {
                const request = IssueRequest.from(privateStateToken);

                const issueResponse = issuer.issue(0, request);
                return new Response(`Issuing ${issueResponse.signed.length} tokens.`, {
                    status: 200,
                    headers: {
                        "Content-Type": "text/plain",
                        'Sec-Private-State-Token': issueResponse.toString(),
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }
            return new Response(`No issuance provided.`);
        }
        else if (url.pathname === "/pst/r") {
            const privateStateToken = request.headers.get("sec-private-state-token");
            const redeemPayload = Object.fromEntries([...request.headers.entries()])
            redeemPayload.cf = request.cf

            if (privateStateToken) {
                const request = RedeemRequest.from(privateStateToken);
                const redeemResponse = issuer.redeem(request, redeemPayload);

                return new Response(`RR: ${JSON.stringify(redeemPayload, null, 2)})`, {
                    status: 200,
                    headers: {
                        "Content-Type": "text/plain",
                        'Sec-Private-State-Token': redeemResponse.toString(),
                        'Sec-Private-State-Token-Lifetime': 3660,
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }
            return new Response(`No token provided.`);
        }
        else if (url.pathname === "/pst/echo") {
            const redemptionRecord = request.headers.get("sec-redemption-record");

            return new Response(redemptionRecord, {
                status: 200,
                headers: {
                    "Content-Type": "text/plain",
                    'Sec-Private-State-Token': redemptionRecord,
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
        else if (url.hostname === 'private-state-token.colinbendell.dev' &&
                    (url.pathname === "/" || url.pathname === "/index.html")) {
            return fetch('https://private-access-token.colinbendell.dev/pst.html');
        }
        else if (url.pathname === "/" || url.pathname === "/index.html") {

            const params = new Proxy(new URLSearchParams(request.url.split("?")[1] ?? ""), { get: (searchParams, prop) => searchParams.get(prop), });

            const challenge = params.challenge || encodeURI(CHALLENGE);
            const publicKey = params["token-key"] || encodeURI(CLOUDFLARE_PUB_KEY);
            const tokenHeader = request.headers.get("Authorization")?.split("PrivateToken token=")[1];

            const token = encodeURI(tokenHeader || "") || params.token;
            // ios16 and macOS13 don't actually support quoted challenge + token-key values ...
            let respInit = {
                status: 401,
                headers: {
                    "WWW-Authenticate": `PrivateToken challenge=${decodeURIComponent(challenge).replaceAll('"', '')}, token-key=${decodeURIComponent(publicKey).replaceAll('"', '')}`,
                },
            };

            if (token) {
                respInit = {
                    status: 200,
                }
            }

            const baseResponse = await fetch(request);
            const body = await baseResponse.text();
            const response = new Response(body, respInit);
            response.headers.set("Content-Type", `text/html`);
            response.headers.append("Set-Cookie", `lastchallenge=${Date.now()}; SameSite=Strict; Secure;`);
            response.headers.append("Set-Cookie", `token=${tokenHeader ? token : ''}; SameSite=Strict; Secure;`);
            response.headers.append("Set-Cookie", `challenge=${params.challenge ? '' : challenge}; SameSite=Strict; Secure;`);
            response.headers.append("Set-Cookie", `token-key=${params["token-key"] ? '' : publicKey}; SameSite=Strict; Secure;`);

            return response;
        }
        else {
            return fetch(request);
        }
    }
}