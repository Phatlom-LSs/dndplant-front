import { Geist, Geist_Mono } from "next/font/google";
import Image from "next/image"
import "./style/globals.css"


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "IWPDA"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <header className="header">
              <Image
                  src="/assets/images/383346931_7060143100662598_4887970724141003749_n.png"
                  alt="InET_logo"
                  width={100}
                  height={100}
                  className="InET_logo"
              />
              <h1 className="site-title">Interactive Plant Design</h1>
              <Image
                  src="/assets/images/College of Industrial Technology_Brand book_FINAL-21.png"
                  alt="CIT_logo"
                  width={200}
                  height={100}
                  className="CIT_logo"
              />
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}