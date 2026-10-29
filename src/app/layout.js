import { Inter, Space_Grotesk, Outfit, Manrope, Fira_Code } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "material-symbols/outlined.css";
// Dakara DS, in load order: tokens -> derived colour/type -> component styles.
// Imported as their own stylesheets rather than @import'd inside globals.css,
// because nesting them there routes them through the Tailwind pipeline, which
// fails to parse them.
import "@/vendor/dakara/tokens.css";
import "@/vendor/dakara/colors_and_type.css";
import "@/vendor/dakara/components.css";
import "./globals.css";
import { ThemeProvider } from "@/shared/components/ThemeProvider";
import "@/lib/network/initOutboundProxy"; // Auto-initialize outbound proxy env
import "@/shared/services/bootstrap"; // Auto-run initializeApp (watchdog, auto-resume tunnel)
import { initConsoleLogCapture } from "@/lib/consoleLogBuffer";
import { RuntimeI18nProvider } from "@/i18n/RuntimeI18nProvider";

// Hook console immediately at module load time (server-side only, runs once)
initConsoleLogCapture();

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// Dakara DS type families. Loaded through next/font rather than an @import in
// globals.css: Turbopack rejects a plain @import url() after @import
// "tailwindcss", and next/font self-hosts them (no render-blocking fetch).
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ds-display" });
const outfit = Outfit({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ds-heading" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-ds-body" });
const firaCode = Fira_Code({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-ds-mono" });

const dsFontVars = [spaceGrotesk, outfit, manrope, firaCode].map((f) => f.variable).join(" ");

export const metadata = {
  title: "DakaraRouter",
  description: "Centralized Claude account monitoring — per-account quota, usage and reporting.",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport = {
  themeColor: "#080909",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply persisted theme before first paint so a reload does not flash the
            default (light) theme before the client store hydrates. Mirrors the
            zustand-persist "theme" key and the `dark` class applyTheme() sets. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=document.documentElement;var s=localStorage.getItem('theme');var t=s?(JSON.parse(s).state||{}).theme:'dark';t=t||'dark';var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=(t==='dark')||(t==='system'&&m);if(dark){r.classList.add('dark')}else{r.classList.add('light')}}catch(e){r.classList.add('dark')}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `var d=document,r=d.documentElement,f=function(){r.classList.add('fonts-loaded')};if(d.fonts&&d.fonts.load){d.fonts.load('24px "Material Symbols Outlined"').then(f).catch(f);setTimeout(f,3000)}else{f()}`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${dsFontVars} font-sans antialiased`}>
        <ThemeProvider>
          <RuntimeI18nProvider>
            {children}
          </RuntimeI18nProvider>
        </ThemeProvider>
        <GoogleAnalytics gaId={"G-LC959F603F"} />
      </body>
    </html>
  );
}
