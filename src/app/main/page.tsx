'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Image from 'next/image';

import { DndContext, closestCorners } from '@dnd-kit/core';

export default function HomePage() {
  const [task, setTask] = useState([

  ])

  const router = useRouter();
  
  const logout = () => {
    router.push('/');
  };
  return (
    <div>
      <main>
        <div className='container'>
          <div className='Tab'>
          <Image
                src="/assets/images/383346931_7060143100662598_4887970724141003749_n.png"
                alt="InET_logo"
                width={100}
                height={100}
          >

          </Image>

          </div>
        </div>
          


      </main>
    </div>
  );
}
