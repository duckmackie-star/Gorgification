/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Upload, Camera, Settings2, Download, Trash2, Loader2, Sparkles, AlertCircle, Library as LibraryIcon, PlusSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const GORG_URL = "https://i.postimg.cc/T3fXSHBh/IMG-5217.png";

interface LibraryItem {
  id: string;
  dataUrl: string;
  timestamp: number;
}

interface FaceBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [faces, setFaces] = useState<FaceBox[]>([]);
  const [options, setOptions] = useState({
    autoDetect: true,
    stretch: true,
    opacity: 1,
    scale: 1.1,
  });
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>(() => {
    const saved = localStorage.getItem('gorg_library');
    return saved ? JSON.parse(saved) : [];
  });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const drawAll = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mainImg = new Image();
    mainImg.src = image;
    await mainImg.decode();

    // Set canvas size to match image or container
    const maxWidth = window.innerWidth * 0.9;
    const maxHeight = window.innerHeight * 0.6;
    let width = mainImg.width;
    let height = mainImg.height;

    if (width > maxWidth) {
      height *= (maxWidth / width);
      width = maxWidth;
    }
    if (height > maxHeight) {
      width *= (maxHeight / height);
      height = maxHeight;
    }

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(mainImg, 0, 0, width, height);

    const gorgImg = new Image();
    gorgImg.crossOrigin = "anonymous";
    gorgImg.src = GORG_URL;
    await gorgImg.decode();

    ctx.globalAlpha = options.opacity;

    faces.forEach(face => {
      const x = (face.xmin / 1000) * width;
      const y = (face.ymin / 1000) * height;
      const w = ((face.xmax - face.xmin) / 1000) * width;
      const h = ((face.ymax - face.ymin) / 1000) * height;

      // Apply scaling
      const scaledW = w * options.scale;
      const scaledH = h * options.scale;
      const offsetW = (scaledW - w) / 2;
      const offsetH = (scaledH - h) / 2;

      if (options.stretch) {
        ctx.drawImage(gorgImg, x - offsetW, y - offsetH, scaledW, scaledH);
      } else {
        // Maintain aspect ratio variant
        const gorgAspect = gorgImg.width / gorgImg.height;
        const targetAspect = scaledW / scaledH;
        let finalW = scaledW;
        let finalH = scaledH;

        if (gorgAspect > targetAspect) {
          finalW = scaledH * gorgAspect;
        } else {
          finalH = scaledW / gorgAspect;
        }
        
        const finalX = x - (finalW - w) / 2;
        const finalY = y - (finalH - h) / 2;
        ctx.drawImage(gorgImg, finalX, finalY, finalW, finalH);
      }
    });

    ctx.globalAlpha = 1.0;
  }, [image, faces, options]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / canvas.width) * 1000;
    const y = ((e.clientY - rect.top) / canvas.height) * 1000;

    // Add a default sized box (e.g., 10% of width/height)
    const size = 100; 
    setFaces(prev => [...prev, {
      ymin: y - size / 2,
      xmin: x - size / 2,
      ymax: y + size / 2,
      xmax: x + size / 2,
    }]);
  };

  useEffect(() => {
    if (image) {
      drawAll();
    }
  }, [image, faces, options, drawAll]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setFaces([]);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const detectFaces = async () => {
    if (!image) return;
    setIsProcessing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const base64Data = image.split(',')[1];
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data,
                },
              },
              {
                text: "Analyze this image and identify all human faces. Return a JSON array of bounding boxes for each face in normalized coordinates [0-1000]. Example: [{\"ymin\": 10, \"xmin\": 20, \"ymax\": 50, \"xmax\": 40}]. Return ONLY the valid JSON array and nothing else.",
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER },
              },
              required: ["ymin", "xmin", "ymax", "xmax"],
            }
          }
        }
      });

      const detected = JSON.parse(response.text || "[]");
      setFaces(detected);
      if (detected.length === 0) {
        setError("No faces detected. Try another image or adjust manually?");
      }
    } catch (err) {
      console.error(err);
      setError("Face detection failed. The Gorg is displeased.");
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (image && options.autoDetect && faces.length === 0 && !isProcessing) {
      detectFaces();
    }
  }, [image, options.autoDetect]);

  useEffect(() => {
    localStorage.setItem('gorg_library', JSON.stringify(library));
  }, [library]);

  const addToLibrary = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const newItem: LibraryItem = {
      id: crypto.randomUUID(),
      dataUrl: canvas.toDataURL('image/png'),
      timestamp: Date.now(),
    };
    setLibrary(prev => [newItem, ...prev]);
  };

  const removeFromLibrary = (id: string) => {
    setLibrary(prev => prev.filter(item => item.id !== id));
  };

  const downloadFromLibrary = (dataUrl: string) => {
    const link = document.createElement('a');
    link.download = `gorgified-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'gorgified.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#F0F0F0] font-sans text-[#1A1A1A] selection:bg-[#00FF00] selection:text-black">
      {/* Header */}
      <header className="border-b border-[#1A1A1A] bg-white p-6 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <motion.h1 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-4xl font-black tracking-tighter uppercase italic flex items-center gap-2"
          >
            <Sparkles className="text-[#00FF00] fill-current" />
            Gorgification
          </motion.h1>
          <div className="flex gap-4">
            {image && (
              <button 
                onClick={() => { setImage(null); setFaces([]); }}
                className="p-3 border border-[#1A1A1A] hover:bg-[#FF0000] hover:text-white transition-colors"
                title="Reset"
              >
                <Trash2 size={24} />
              </button>
            )}
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-[#00FF00] text-black px-6 py-3 font-bold border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all flex items-center gap-2"
            >
              <Upload size={20} />
              UPLOAD IMAGE
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept="image/*"
            />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8">
        {/* Workspace */}
        <div className="flex flex-col gap-6">
          <div className="border-4 border-[#1A1A1A] bg-white min-h-[500px] flex items-center justify-center relative overflow-hidden pattern-dots">
            <AnimatePresence mode="wait">
              {!image ? (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center p-12"
                >
                  <div className="w-24 h-24 bg-[#E0E0E0] rounded-full mx-auto mb-6 flex items-center justify-center border-2 border-dashed border-[#1A1A1A]">
                    <Camera size={48} className="text-[#888]" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Feed the Gorg an image</h2>
                  <p className="text-[#666] mb-8">Drop an image here or use the upload button above.</p>
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-[#1A1A1A] px-8 py-4 font-black hover:bg-[#1A1A1A] hover:text-white transition-all uppercase tracking-widest"
                  >
                    Select File
                  </button>
                </motion.div>
              ) : (
                <motion.div 
                  key="preview"
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative group cursor-crosshair"
                >
                  <canvas 
                    ref={canvasRef} 
                    onClick={handleCanvasClick}
                    className="max-w-full shadow-[20px_20px_0px_0px_rgba(0,0,0,0.1)]"
                  />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 text-white text-[10px] px-2 py-1 uppercase font-bold pointer-events-none">
                    Click to add Gorg manually
                  </div>
                  {isProcessing && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                      <Loader2 className="animate-spin text-[#00FF00] mb-4" size={64} />
                      <p className="font-bold text-xl uppercase tracking-widest">Scanning for victims...</p>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {error && (
            <motion.div 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="bg-[#FFEAEA] border-2 border-[#FF0000] p-4 flex items-center gap-3 text-[#FF0000]"
            >
              <AlertCircle size={24} />
              <p className="font-bold">{error}</p>
            </motion.div>
          )}

          {image && (
            <div className="flex justify-between items-center gap-4 flex-wrap">
              <p className="font-mono text-sm uppercase opacity-50">
                {faces.length} faces Gorgified
              </p>
              <div className="flex gap-4">
                <button 
                  onClick={addToLibrary}
                  disabled={isProcessing}
                  className="bg-[#00FF00] text-black px-8 py-4 font-black flex items-center gap-3 border-2 border-[#1A1A1A] shadow-[4px_4px_0px_0px_#1A1A1A] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all disabled:opacity-50"
                >
                  <PlusSquare size={20} />
                  ADD TO LIBRARY
                </button>
                <button 
                  onClick={downloadImage}
                  disabled={isProcessing}
                  className="bg-[#1A1A1A] text-white px-8 py-4 font-black flex items-center gap-3 hover:bg-[#333] transition-colors disabled:opacity-50"
                >
                  <Download size={20} />
                  SAVE MASTERPIECE
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Controls */}
        <aside className="flex flex-col gap-8">
          <section className="bg-white border-2 border-[#1A1A1A] p-6 shadow-[8px_8px_0px_0px_#1A1A1A]">
            <h3 className="text-xl font-black uppercase mb-6 flex items-center gap-2 border-b-2 border-[#1A1A1A] pb-2">
              <Settings2 size={24} />
              Gorg Config
            </h3>

            <div className="space-y-6">
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="font-bold uppercase text-sm tracking-tight">Auto Detect</span>
                <div className="relative inline-flex items-center">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={options.autoDetect}
                    onChange={(e) => setOptions({...options, autoDetect: e.target.checked})}
                  />
                  <div className="w-14 h-7 bg-[#E0E0E0] peer-focus:outline-none border-2 border-[#1A1A1A] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-[#1A1A1A] after:border-[#1A1A1A] after:border after:rounded-full after:h-4 after:w-5 after:transition-all peer-checked:bg-[#00FF00]"></div>
                </div>
              </label>

              <label className="flex items-center justify-between cursor-pointer group">
                <span className="font-bold uppercase text-sm tracking-tight">Stretch Mode</span>
                <div className="relative inline-flex items-center">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={options.stretch}
                    onChange={(e) => setOptions({...options, stretch: e.target.checked})}
                  />
                  <div className="w-14 h-7 bg-[#E0E0E0] peer-focus:outline-none border-2 border-[#1A1A1A] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-[#1A1A1A] after:border-[#1A1A1A] after:border after:rounded-full after:h-4 after:w-5 after:transition-all peer-checked:bg-[#00FF00]"></div>
                </div>
              </label>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase text-sm tracking-tight">Gorg Scale</span>
                  <span className="font-mono text-xs">{options.scale.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="3" 
                  step="0.1"
                  value={options.scale}
                  onChange={(e) => setOptions({...options, scale: parseFloat(e.target.value)})}
                  className="w-full accent-[#00FF00]"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase text-sm tracking-tight">Opacity</span>
                  <span className="font-mono text-xs">{Math.round(options.opacity * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.1" 
                  max="1" 
                  step="0.05"
                  value={options.opacity}
                  onChange={(e) => setOptions({...options, opacity: parseFloat(e.target.value)})}
                  className="w-full accent-[#00FF00]"
                />
              </div>

              {image && (
                <button 
                  onClick={detectFaces}
                  disabled={isProcessing}
                  className="w-full border-2 border-[#1A1A1A] py-3 font-bold hover:bg-[#1A1A1A] hover:text-white transition-all uppercase text-sm flex items-center justify-center gap-2"
                >
                  <Sparkles size={16} />
                  Re-scan Faces
                </button>
              )}
            </div>
          </section>

          <footer className="text-[10px] font-mono uppercase opacity-40 leading-relaxed">
            The Gorg is eternal. <br />
            All faces are subject to <br />
            Gorgification. No refunds.
          </footer>
        </aside>
      </main>

      {/* Library Section */}
      <section className="max-w-7xl mx-auto px-8 pb-20">
        <div className="border-t-4 border-[#1A1A1A] pt-12">
          <div className="flex items-center gap-4 mb-8">
            <LibraryIcon size={32} className="text-[#1A1A1A]" />
            <h2 className="text-3xl font-black uppercase tracking-tighter">Your Masterpiece Library</h2>
            <div className="h-1 flex-1 bg-[#1A1A1A]"></div>
            <span className="font-mono text-sm bg-black text-[#00FF00] px-3 py-1">{library.length} ITEMS</span>
          </div>

          {!library.length ? (
            <div className="bg-white border-2 border-[#1A1A1A] border-dashed p-12 text-center">
              <p className="text-[#888] font-bold uppercase tracking-widest">No saved Gorgifications yet...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              <AnimatePresence>
                {library.map((item) => (
                  <motion.div 
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="bg-white border-2 border-[#1A1A1A] p-2 group shadow-[6px_6px_0px_0px_#1A1A1A] hover:shadow-none hover:translate-x-1 hover:translate-y-1 transition-all"
                  >
                    <div className="aspect-square bg-gray-100 overflow-hidden mb-2 relative">
                      <img src={item.dataUrl} alt="Saved Gorgification" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                        <button 
                          onClick={() => downloadFromLibrary(item.dataUrl)}
                          className="p-2 bg-[#00FF00] text-black border border-black hover:scale-110 transition-transform"
                          title="Download"
                        >
                          <Download size={20} />
                        </button>
                        <button 
                          onClick={() => removeFromLibrary(item.id)}
                          className="p-2 bg-[#FF0000] text-white border border-black hover:scale-110 transition-transform"
                          title="Delete"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono uppercase px-1">
                      <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                      <button 
                        onClick={() => {
                          setImage(item.dataUrl);
                          setFaces([]);
                        }}
                        className="hover:underline text-[#00AA00] font-bold"
                      >
                        RE-EDIT
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>

      <style>{`
        .pattern-dots {
          background-image: radial-gradient(#CED4DA 1px, transparent 1px);
          background-size: 20px 20px;
        }
      `}</style>
    </div>
  );
}
