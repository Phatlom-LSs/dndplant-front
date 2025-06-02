'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function HomePage() {
  const router = useRouter();

  const goToLogin = () => {
    router.push('/login');
  };

  return (
    <div>
      <main>
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
        <button className='button' onClick={goToLogin}>Sign In</button>  

        {/* About Section */}
        <section className="about">
          <h1 id='headerAbout'>About</h1>
          <div id='subAbout'>
            <p>
              This website is the senior thesis of Chetthapat Tepthian from the Department of Industrial Engineering Technology, 
              specializing in Product Design and Manufacturing, College of Industrial Technology, KMUTNB.
            </p>
            <p>
              It offers an intuitive drag-and-drop tool for factory layout planning using CRAFT, 
              CORELAP, and ALDEP methods, modernizing traditional paper-based approaches.
            </p>
            <p>
              Built with Node.js, the site is designed to make layout design faster, smarter, and more accessible.
            </p>
          </div>
        </section>
      </main>
        <footer className="footer">
            © 2025 Chetthapat Tepthian | Senior Thesis Project | KMUTNB
        </footer>
    </div>
  );
}
