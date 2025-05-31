'use client';

import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  const goToLogin = () => {
    router.push('/login');
  };

  return (
    <div>
      <main>
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
