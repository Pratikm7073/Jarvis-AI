import queue
import sys
import json
import sounddevice as sd
from vosk import Model, KaldiRecognizer
import ollama
import pyttsx3

print("\n[System] Booting Zero-Trust Architecture...")

# 1. Initialize Offline Text-to-Speech (The Mouth)
engine = pyttsx3.init()
engine.setProperty('rate', 170) # Adjusts how fast Jarvis speaks

def speak(text):
    """Prints and speaks the response."""
    print(f"\n[Jarvis]: {text}")
    engine.say(text)
    engine.runAndWait()

# 2. Initialize Offline Speech Recognition (The Ears)
try:
    print("[System] Loading 1.8GB Acoustic Model into RAM... (Please wait)")
    audio_model = Model("vosk-model")
except Exception as e:
    print("Error: Could not find 'vosk-model' folder. Make sure it is extracted.")
    sys.exit(1)

samplerate = 16000

def listen():
    """Listens to the microphone and returns text."""
    q = queue.Queue()
    def callback(indata, frames, time, status):
        if status:
            print(status, file=sys.stderr)
        q.put(bytes(indata))

    print("\n[Microphone Active] Listening... (Speak now, pause when finished)")
    with sd.RawInputStream(samplerate=samplerate, blocksize=8000, device=None, dtype='int16', channels=1, callback=callback):
        rec = KaldiRecognizer(audio_model, samplerate)
        while True:
            data = q.get()
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                text = result.get('text', '')
                if text:
                    print(f"\n[You]: {text}")
                    return text

# 3. The Master Loop
if __name__ == "__main__":
    speak("Secure environment initialized. I am online.")
    
    while True:
        # Listen for your command
        user_text = listen()
        
        # Emergency Kill Switch
        if "stop" in user_text.lower() or "shut down" in user_text.lower():
            speak("Shutting down the local network. Goodbye.")
            break
            
        print("\n[System] Routing to GTX 1050 Ti...")
        
        # Send text to Phi-3 (The Brain)
        response = ollama.chat(model='phi3', messages=[
            {
                'role': 'system', 
                'content': 'You are Jarvis, a highly secure, offline AI assistant. Keep your responses brief, conversational, and under three sentences.'
            },
            {
                'role': 'user', 
                'content': user_text
            }
        ])
        
        jarvis_reply = response['message']['content']
        
        # Speak the answer
        speak(jarvis_reply)