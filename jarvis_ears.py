import queue
import sys
import json
import sounddevice as sd
from vosk import Model, KaldiRecognizer

def listen_to_user():
    """
    Activates the microphone and listens using the offline Vosk model.
    Returns the transcribed text.
    """
    print("\n[System] Loading Audio Subsystem (Zero-Trust)...")
    
    try:
        model = Model("vosk-model")
    except Exception as e:
        print("Error: Could not find the 'vosk-model' folder. Make sure it is extracted in your project directory.")
        sys.exit(1)

    samplerate = 16000
    q = queue.Queue()

    def callback(indata, frames, time, status):
        if status:
            print(status, file=sys.stderr)
        q.put(bytes(indata))

    print("\n[Microphone Active] Jarvis is listening... (Speak now, pause when finished)")

    with sd.RawInputStream(samplerate=samplerate, blocksize=8000, device=None, dtype='int16', channels=1, callback=callback):
        rec = KaldiRecognizer(model, samplerate)
        
        while True:
            data = q.get()
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                transcription = result.get('text', '')
                
                if transcription:
                    print(f"\n[Transcribed] -> {transcription}")
                    return transcription

if __name__ == "__main__":
    speech_text = listen_to_user()
    print("\nTest Complete. Voice successfully captured locally.")