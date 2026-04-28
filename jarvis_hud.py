import sys, queue, json, sounddevice as sd, ollama, pyttsx3, psutil, os
from vosk import Model, KaldiRecognizer
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *
from PyQt5.QtGui import *
from docx2pdf import convert 

# ==========================================
# 1. THE VISUAL "HEART" (Arc Reactor)
# ==========================================
class ArcReactor(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.angle = 0
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.rotate)
        self.timer.start(30) 

    def rotate(self):
        self.angle = (self.angle + 5) % 360
        self.update()

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.Antialiasing)
        cx, cy = self.width() // 2, self.height() // 2
        
        # Outer Ring
        pen = QPen(QColor(0, 255, 255, 150), 3, Qt.DashLine)
        painter.setPen(pen)
        painter.translate(cx, cy)
        painter.rotate(self.angle)
        painter.drawEllipse(-60, -60, 120, 120)
        
        # Inner Ring
        painter.rotate(-self.angle * 2)
        pen.setColor(QColor(0, 255, 255, 100))
        painter.drawEllipse(-45, -45, 90, 90)
        
        # Core Pulse
        painter.resetTransform()
        painter.translate(cx, cy)
        gradient = QRadialGradient(0, 0, 30)
        gradient.setColorAt(0, QColor(0, 255, 255, 255))
        gradient.setColorAt(1, QColor(0, 255, 255, 0))
        painter.setBrush(gradient)
        painter.setPen(Qt.NoPen)
        painter.drawEllipse(-25, -25, 50, 50)

# ==========================================
# 2. THE AI BACKEND (1.8GB Model Restored)
# ==========================================
class AIEngine(QThread):
    update_screen = pyqtSignal(str)
    quit_app = pyqtSignal()

    def run(self):
        engine = pyttsx3.init()
        engine.setProperty('rate', 175)
        voices = engine.getProperty('voices')
        if len(voices) > 1: engine.setProperty('voice', voices[1].id) 
        
        def speak(text):
            self.update_screen.emit(f"<span style='color: #00ffff;'>[JARVIS]: {text}</span>")
            engine.say(text)
            engine.runAndWait()

        self.update_screen.emit("[SYSTEM] Loading 1.8GB Acoustic Model into RAM...")
        try:
            # Reverted back to the highly accurate 1.8GB model
            audio_model = Model("vosk-model")
        except Exception as e:
            self.update_screen.emit("<span style='color: red;'>[ERROR] 'vosk-model' folder missing.</span>")
            return

        samplerate = 16000
        speak("Mark 3 interface online. How can I assist, sir?")

        while True:
            q = queue.Queue()
            def cb(i, f, t, s): q.put(bytes(i))
            
            self.update_screen.emit("\n<span style='color: #00ff00;'>[MIC ACTIVE] Listening...</span>")
            with sd.RawInputStream(samplerate=samplerate, blocksize=8000, dtype='int16', channels=1, callback=cb):
                rec = KaldiRecognizer(audio_model, samplerate)
                user_text = ""
                while not user_text:
                    data = q.get()
                    if rec.AcceptWaveform(data):
                        res = json.loads(rec.Result())
                        user_text = res.get('text', '')
            
            self.update_screen.emit(f"<span style='color: white;'>[YOU]: {user_text}</span>")

            # Agent Tools
            if "convert" in user_text and "pdf" in user_text:
                speak("Searching for local documents to convert.")
                speak("Conversion logic ready. Please specify the file in the terminal.")
                continue

            if "shut down" in user_text or "stop" in user_text:
                speak("Powering down. Goodbye.")
                self.quit_app.emit()
                break

            # Standard Brain Routing
            self.update_screen.emit("[SYSTEM] Routing to GTX 1050 Ti...")
            resp = ollama.chat(model='phi3', messages=[
                {'role':'system','content':'You are Jarvis, a highly secure, offline AI assistant. Keep responses brief and under three sentences.'},
                {'role':'user','content':user_text}
            ])
            speak(resp['message']['content'])

# ==========================================
# 3. THE MARK III HUD LAYOUT
# ==========================================
class JarvisMK3(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setGeometry(100, 100, 1100, 700)

        self.container = QFrame(self)
        self.container.setGeometry(0, 0, 1100, 700)
        self.container.setStyleSheet("background-color: rgba(5, 10, 20, 220); border: 2px solid #00ffff; border-radius: 15px;")
        
        self.layout = QHBoxLayout(self.container)
        
        self.sidebar = QVBoxLayout()
        self.stats_label = QLabel("SYSTEM METRICS")
        self.stats_label.setStyleSheet("color: #00ffff; font-weight: bold; border: none;")
        self.sidebar.addWidget(self.stats_label)
        
        self.cpu_bar = QProgressBar()
        self.cpu_bar.setStyleSheet("QProgressBar { border: 1px solid #00ffff; color: white; text-align: center; } QProgressBar::chunk { background-color: #00ffff; }")
        self.sidebar.addWidget(QLabel("CPU USAGE"))
        self.sidebar.addWidget(self.cpu_bar)
        
        self.ram_bar = QProgressBar()
        self.ram_bar.setStyleSheet("QProgressBar { border: 1px solid #00ffff; color: white; text-align: center; } QProgressBar::chunk { background-color: #55aaff; }")
        self.sidebar.addWidget(QLabel("RAM USAGE"))
        self.sidebar.addWidget(self.ram_bar)

        self.layout.addLayout(self.sidebar, 1)

        self.center_layout = QVBoxLayout()
        self.reactor = ArcReactor()
        self.center_layout.addWidget(self.reactor)
        self.layout.addLayout(self.center_layout, 2)

        self.terminal = QTextEdit()
        self.terminal.setReadOnly(True)
        self.terminal.setStyleSheet("background: transparent; color: #00ffff; border: 1px solid #00ffff; font-family: Consolas;")
        self.layout.addWidget(self.terminal, 2)

        self.stats_timer = QTimer()
        self.stats_timer.timeout.connect(self.update_stats)
        self.stats_timer.start(2000)

        self.ai = AIEngine()
        self.ai.update_screen.connect(self.append_text)
        self.ai.quit_app.connect(self.close)
        self.ai.start()

    def update_stats(self):
        self.cpu_bar.setValue(int(psutil.cpu_percent()))
        self.ram_bar.setValue(int(psutil.virtual_memory().percent))
        
    def append_text(self, text):
        self.terminal.append(text)
        scrollbar = self.terminal.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = JarvisMK3()
    window.show()
    sys.exit(app.exec_())