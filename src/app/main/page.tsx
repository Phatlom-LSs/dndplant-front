'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
        <button className='button' onClick={logout}>logout</button>
      </main>
    </div>
  );
}
