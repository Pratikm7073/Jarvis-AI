import ollama
import time

def evaluate_jarvis_performance(prompt):
    """
    Sends a prompt to the local model and calculates response latency 
    and generation speed (Operational Metrics).
    """
    print(f"\n[System] Initiating Zero-Trust Environment...")
    print(f"User: {prompt}\n")
    
    # Start the performance timer
    start_time = time.time()
    
    # Call the local model. No API keys, no internet required.
    response = ollama.chat(model='phi3', messages=[
        {
            'role': 'system',
            'content': 'You are Jarvis, a highly efficient, direct, and private AI assistant built by a cybersecurity engineer. Keep your answers concise.'
        },
        {
            'role': 'user', 
            'content': prompt
        }
    ])
    
    # Stop the timer the moment the response finishes
    end_time = time.time()
    
    answer = response['message']['content']
    
    # Calculate operational metrics
    latency = end_time - start_time
    word_count = len(answer.split())
    words_per_second = word_count / latency if latency > 0 else 0
    
    # Output the AI's response
    print(f"Jarvis: {answer}\n")
    
    # Output the Telemetry Data
    print("-" * 45)
    print("   [SYSTEM PERFORMANCE METRICS]   ")
    print("-" * 45)
    print(f"Total Response Time: {latency:.2f} seconds")
    print(f"Generation Speed:    {words_per_second:.2f} words/second")
    print(f"Total Word Count:    {word_count} words")
    print("-" * 45)

if __name__ == "__main__":
    # Test Question targeting security architecture
    test_question = "Explain the primary security advantage of running an AI model locally rather than in the cloud. Keep it to two sentences."
    
    evaluate_jarvis_performance(test_question)