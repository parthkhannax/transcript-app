import { useState, useRef, useEffect, useCallback } from 'react'

interface Segment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptResult {
  text: string;
  chunks: Segment[];
}

function App() {
  const [file, setFile] = useState<File | null>(null)
  
  // Model state
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [isModelReady, setIsModelReady] = useState(false)
  const [modelProgress, setModelProgress] = useState<{file: string, progress: number}[]>([])
  
  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [result, setResult] = useState<TranscriptResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)

  useEffect(() => {
    // Initialize Web Worker
    workerRef.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

    workerRef.current.onmessage = (e) => {
      const { status, data } = e.data

      if (status === 'progress') {
        setModelProgress(prev => {
          const newProgress = [...prev]
          const existing = newProgress.find(p => p.file === data.file)
          if (existing) {
            existing.progress = data.progress
          } else {
            newProgress.push({ file: data.file, progress: data.progress })
          }
          return newProgress
        })
      }
      
      if (status === 'ready') {
        setIsModelLoading(false)
        setIsModelReady(true)
      }
      
      if (status === 'transcribing') {
        setIsTranscribing(true)
      }
      
      if (status === 'complete') {
        setIsTranscribing(false)
        setResult(data)
      }
      
      if (status === 'error') {
        setIsModelLoading(false)
        setIsTranscribing(false)
        setError(data)
      }
    }

    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const loadModel = () => {
    if (workerRef.current && !isModelReady && !isModelLoading) {
      setIsModelLoading(true)
      setError(null)
      workerRef.current.postMessage({ type: 'load' })
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0])
      setResult(null)
      setError(null)
      if (!isModelReady) {
        loadModel()
      }
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0])
      setResult(null)
      setError(null)
      if (!isModelReady) {
        loadModel()
      }
    }
  }

  // Decodes the audio file into a raw float32 array sampled at 16kHz
  const decodeAudio = async (file: File): Promise<Float32Array> => {
    const arrayBuffer = await file.arrayBuffer()
    const audioContext = new AudioContext({ sampleRate: 16000 })
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    return audioBuffer.getChannelData(0)
  }

  const handleTranscribe = async () => {
    if (!file || !workerRef.current || !isModelReady) return

    setIsTranscribing(true)
    setError(null)

    try {
      const audioData = await decodeAudio(file)
      workerRef.current.postMessage({ type: 'transcribe', audio: audioData })
    } catch (err: any) {
      setError("Failed to decode audio file. " + err.message)
      setIsTranscribing(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight mb-4 bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Local Audio Transcription
          </h1>
          <p className="text-slate-400 text-lg">
            100% Private & Offline. Powered by Whisper in your browser.
          </p>
        </header>

        {/* Upload Section */}
        <div 
          className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 ${
            file ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600'
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="audio/*,video/*" 
            className="hidden" 
          />
          
          {file ? (
            <div className="flex flex-col items-center gap-4">
              <svg className="w-16 h-16 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              <div>
                <p className="text-xl font-semibold text-slate-200">{file.name}</p>
                <p className="text-slate-400 text-sm mt-1">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
              
              <div className="mt-4 flex flex-col items-center w-full max-w-sm">
                {!isModelReady ? (
                  <div className="w-full text-center">
                    <p className="text-sm text-indigo-300 mb-2 font-medium flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Loading AI Model (approx 70MB)...
                    </p>
                    <div className="w-full space-y-1">
                      {window.navigator.onLine === false && <p className="text-xs text-yellow-400">Offline mode</p>}
                      {modelProgress.map((p, i) => (
                        <div key={i} className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.max(5, p.progress)}%` }}></div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleTranscribe(); }}
                    disabled={isTranscribing}
                    className="w-full px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl font-medium transition-colors cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                  >
                    {isTranscribing ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Transcribing...
                      </span>
                    ) : 'Transcribe Audio'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 cursor-pointer">
              <div className="p-4 bg-slate-800 rounded-full shadow-inner shadow-slate-900/50 group-hover:bg-slate-700 transition-colors">
                <svg className="w-10 h-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-medium text-slate-300">Click to upload or drag and drop</p>
                <p className="text-slate-500 text-sm mt-1">MP3, M4A, WAV, MP4</p>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-8 p-4 bg-red-900/30 border border-red-800/50 rounded-xl text-red-200 flex items-start gap-3">
            <svg className="w-6 h-6 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="break-words">{error}</p>
          </div>
        )}

        {/* Results Section */}
        {result && (
          <div className="mt-12 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight text-slate-100">Transcript</h2>
              <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-300 text-sm font-medium">
                Done
              </div>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl overflow-hidden shadow-xl shadow-black/20">
              <div className="p-6">
                <p className="text-lg leading-relaxed text-slate-300 font-medium whitespace-pre-wrap">
                  {result.text}
                </p>
              </div>
              
              {result.chunks && result.chunks.length > 0 && (
                <div className="bg-slate-900 border-t border-slate-800 p-6">
                  <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Timestamps</h3>
                  <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                    {result.chunks.map((seg, i) => (
                      <div key={i} className="flex gap-4 group">
                        <div className="w-20 text-xs font-mono text-slate-500 pt-1 group-hover:text-indigo-400 transition-colors">
                          {formatTime(seg.start)}
                        </div>
                        <p className="flex-1 text-slate-400 group-hover:text-slate-200 transition-colors">
                          {seg.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
