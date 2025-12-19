import React, { useState, useEffect } from 'react';
import { Wrench } from 'lucide-react';

const sayings = [
  "Looking for the drill bit that was just here.",
  "Swapping batteries… again.",
  "Leveling it. Re-leveling it. Trusting the level.",
  "Waiting for the laser to stop lying.",
  "Finding the stud on the second try.",
  "Tightening until it’s snug. Not too snug.",
  "Checking the manual. Pretending we didn’t need it.",
  "Packing the toolbox back the way it’ll never stay.",
];

const LoadingSayings: React.FC = () => {
  const [currentSayingIndex, setCurrentSayingIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSayingIndex((prevIndex) => (prevIndex + 1) % sayings.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center text-gray-500 p-4">
      <Wrench className="h-8 w-8 animate-spin text-gray-400 mb-4" />
      <p className="text-lg font-medium">{sayings[currentSayingIndex]}</p>
    </div>
  );
};

export default LoadingSayings;