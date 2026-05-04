🤖 Jarvis-AI: Local Offline Voice Assistant
Jarvis-AI is a completely offline, zero-trust architecture voice assistant. It listens to your voice, processes the input using a locally hosted Large Language Model (LLM), and speaks the response back to you—all without sending a single byte of your data to the cloud.

✨ Features
Offline Speech Recognition (The Ears): Uses Vosk to securely transcribe audio locally via your microphone.

Local LLM Processing (The Brain): Powered by Microsoft's Phi-3 model running locally via Ollama, ensuring rapid, secure, and private reasoning.

Offline Text-to-Speech (The Mouth): Uses pyttsx3 to generate speech natively on your machine.

Zero-Trust Architecture: Operates entirely without an internet connection once the models are downloaded.

Emergency Kill Switch: Say "stop" or "shut down" to immediately terminate the program.

🛠️ Prerequisites
Before running Jarvis, ensure you have the following installed on your system:

Python 3.8+

A working microphone

Ollama installed and running on your machine.

🚀 Installation & Setup
1. Clone or download this repository
Ensure your Python script (e.g., jarvis.py) is in your project folder.

2. Install the required Python dependencies
Open your terminal and run:

Bash
pip install sounddevice vosk ollama pyttsx3
3. Set up the Language Model (Ollama)
Jarvis uses the Phi-3 model for fast, local inference. Pull the model via Ollama:

Bash
ollama run phi3
(You can close the Ollama terminal once it finishes downloading; just make sure the Ollama app is running in the background).

4. Download the Vosk Acoustic Model

Go to the Vosk Models page.

Download an English model (e.g., vosk-model-en-us-0.22 or the smaller vosk-model-small-en-us-0.15 if you want it to load faster).

Extract the downloaded .zip file.

CRITICAL: Rename the extracted folder to vosk-model and place it in the exact same directory as your Python script.

🎙️ Usage
Once everything is set up, run the script from your terminal:

Bash
python jarvis.py
How to interact:

Wait for the [System] Booting Zero-Trust Architecture... and [Microphone Active] prompts.

Speak clearly into your microphone.

Pause when you are finished speaking. Jarvis will detect the silence, process your command via your GPU/CPU, and speak the response.

To exit:
Simply say "stop" or "shut down" to trigger the system kill switch.

🧠 System Architecture
Audio Input: sounddevice captures raw audio streams.

Transcription: Vosk (KaldiRecognizer) converts the audio waveform into text JSON data.

Prompt Engineering: The text is routed to the local Phi-3 LLM via the ollama Python wrapper, strictly instructed to keep responses brief, conversational, and under three sentences.

Audio Output: The generated text is passed to pyttsx3, matching the set speech rate (170 wpm) for a natural response.
