// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Veriguard — Check before you act. A free, open-source scam checker for links, texts, emails and phone numbers.";

// Plain text + CSS shapes only: Satori's bundled font has no emoji or dingbat
// glyphs, so anything fancier renders as tofu.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#141C2B",
          backgroundImage: "linear-gradient(180deg, #1E2839 0%, #141C2B 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          <svg width="40" height="40" viewBox="0 0 400 400">
            <path d="M347.652 155.562C347.652 193.362 341.087 226.684 328.132 254.598C317.444 277.64 302.471 296.998 283.627 312.122C251.832 337.654 220.49 342.237 217.021 342.673L214.469 343.001L211.917 342.673C208.454 342.237 177.107 337.659 145.313 312.122C136.93 305.391 129.314 297.822 122.499 289.466H152.835C159.907 289.466 165.641 283.733 165.641 276.66V257.607H195.001C195.653 257.607 196.304 257.558 196.948 257.459C204.689 256.268 215.954 252.652 225.61 245.284C235.619 237.646 244.351 225.506 244.351 208.257V157.658C244.351 150.585 238.617 144.852 231.545 144.852H192.276C191.15 139.843 189.288 134.509 186.383 129.533C180.34 119.181 169.491 110.182 152.835 110.182H81.2881V77C81.2881 65.9543 90.2424 57 101.288 57H327.652C338.698 57 347.652 65.9543 347.652 77V155.562Z" fill="#00A676"/>
            <path d="M43.1999 124.6H87.3999V211.266H43.1999V124.6Z" fill="#00A676"/>
            <path d="M25 139.122C25.0001 120.382 42.5683 109 57.9757 109H153.097C170.006 109 181.019 118.135 187.154 128.644C190.103 133.695 191.993 139.11 193.136 144.195H233C240.18 144.195 246 150.015 246 157.195V208.561C246 226.071 237.136 238.395 226.975 246.148C217.173 253.628 205.737 257.299 197.879 258.508C197.225 258.608 196.564 258.658 195.903 258.658H166.097V278C166.097 285.18 160.277 291 153.097 291H94.1217C86.9421 291 81.1217 285.18 81.1217 278C81.1217 270.82 86.9421 265 94.1217 265H140.097V245.658C140.098 238.479 145.918 232.658 153.097 232.658H194.813C199.329 231.814 205.905 229.521 211.202 225.479C216.499 221.437 220 216.163 220 208.561V170.195H181.634C174.454 170.195 168.634 164.374 168.634 157.195C168.634 152.931 167.511 146.567 164.7 141.752C162.274 137.596 159.018 135 153.097 135H106.17V199.049C106.17 214.183 92.5131 231.073 64.6339 231.073C51.147 231.073 40.7911 227.234 33.8216 220.222C27.0233 213.382 25.0001 205.07 25 199.049V139.122ZM51 199.049L51.0135 199.313C51.0771 199.983 51.3855 201.012 52.2619 201.893C53.0923 202.729 56.0529 205.073 64.6339 205.073C73.1898 205.073 76.9981 202.725 78.4989 201.38C80.2128 199.843 80.1705 198.568 80.1704 199.049V135H57.9757C55.8145 135 53.7744 135.816 52.4176 136.954C51.0864 138.071 51.0001 138.919 51 139.122V199.049Z" fill="#141C2B"/>
            <path d="M152.147 157.195C152.147 163.499 147.036 168.61 140.732 168.61C134.428 168.61 129.317 163.499 129.317 157.195C129.317 150.891 134.428 145.78 140.732 145.78C147.036 145.78 152.147 150.891 152.147 157.195Z" fill="#141C2B"/>
          </svg>
          <div style={{ color: "#00A676", fontSize: "30px", fontWeight: 700, letterSpacing: "4px" }}>
            VERIGUARD
          </div>
        </div>
        <div style={{ color: "#f9fafb", fontSize: "92px", fontWeight: 800, lineHeight: 1.05 }}>
          Check before you act
        </div>
        <div style={{ color: "#9ca3af", fontSize: "38px", marginTop: "28px", lineHeight: 1.35 }}>
          Scam checker for links, texts, emails and phone numbers.
        </div>
        <div style={{ color: "#6b7280", fontSize: "28px", marginTop: "44px" }}>
          Free · Open source · Nothing you paste is stored
        </div>
      </div>
    ),
    size,
  );
}
