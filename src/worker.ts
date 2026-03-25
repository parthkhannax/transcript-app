import { pipeline, env } from '@xenova/transformers';

// Disable local models to fetch directly from Hugging Face CDN
env.allowLocalModels = false;
env.useBrowserCache = true;

class PipelineFactory {
    static task = 'automatic-speech-recognition';
    static model = 'Xenova/whisper-tiny.en'; // Tiny quantized model for faster download
    static instance: any = null;

    static async getInstance(progress_callback: Function | null = null) {
        if (this.instance === null) {
            this.instance = await pipeline(this.task, this.model, { 
                progress_callback,
                quantized: true
            });
        }
        return this.instance;
    }
}

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
    // We send { type: 'transcribe', audio: Float32Array }
    if (event.data.type === 'load') {
        try {
            await PipelineFactory.getInstance(x => {
                self.postMessage({ status: 'progress', data: x });
            });
            self.postMessage({ status: 'ready' });
        } catch (error: any) {
            self.postMessage({ status: 'error', data: error.message });
        }
        return;
    }

    if (event.data.type === 'transcribe') {
        try {
            const transcriber = await PipelineFactory.getInstance();
            self.postMessage({ status: 'transcribing' });
            
            const result = await transcriber(event.data.audio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                return_timestamps: true
            });
            
            self.postMessage({ status: 'complete', data: result });
        } catch (error: any) {
            self.postMessage({ status: 'error', data: error.message });
        }
    }
});
