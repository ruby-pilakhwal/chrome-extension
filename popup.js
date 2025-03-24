let recognition = null;
let isRecording = false;
let speechSynthesis = window.speechSynthesis;
let isSpeaking = false;

document.addEventListener('DOMContentLoaded', () => {
  const startButton = document.getElementById('startRecording');
  const stopButton = document.getElementById('stopRecording');
  const originalText = document.getElementById('originalText');
  const translatedText = document.getElementById('translatedText');
  const copyButton = document.getElementById('copyTranslation');
  const sourceLanguage = document.getElementById('sourceLanguage');
  const targetLanguage = document.getElementById('targetLanguage');
  const speakButton = document.getElementById('speakTranslation');

  // Check browser support
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('Your browser does not support speech recognition. Please use Chrome browser.');
    startButton.disabled = true;
    return;
  }

  // Initialize speech recognition
  recognition = new (window.webkitSpeechRecognition || window.SpeechRecognition)();
  recognition.continuous = true;
  recognition.interimResults = true;

  // Add this to manifest.json permissions
  const permissions = {
    permissions: ['microphone']
  };

  async function checkMicrophonePermission() {
    try {
      // First, check if we already have permission
      const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
      
      if (permissionStatus.state === 'granted') {
        return true;
      } else if (permissionStatus.state === 'prompt') {
        // If we need to ask for permission, try to get it
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop()); // Clean up
        return true;
      } else {
        // Permission denied
        console.error('Microphone permission denied');
        return false;
      }
    } catch (error) {
      console.error('Error checking microphone permission:', error);
      return false;
    }
  }

  startButton.addEventListener('click', async () => {
    if (!isRecording) {
      const hasPermission = await checkMicrophonePermission();
      if (hasPermission) {
        startRecording();
      } else {
        // Show instructions for enabling microphone
        alert('Microphone access is required. Please follow these steps:\n\n' +
              '1. Click the lock/site settings icon in the address bar\n' +
              '2. Find "Microphone" in the permissions list\n' +
              '3. Select "Allow"\n' +
              '4. Refresh the extension popup');
        
        // Open Chrome settings for this extension
        chrome.tabs.create({
          url: 'chrome://settings/content/microphone'
        });
      }
    }
  });

  recognition.onstart = () => {
    console.log('Speech recognition started');
    originalText.textContent = 'Listening...';
    startButton.classList.add('listening');
    startButton.textContent = 'Listening...';
  };

  recognition.onend = () => {
    console.log('Speech recognition ended');
    startButton.classList.remove('listening');
    startButton.textContent = 'Start Recording';
    if (isRecording) {
      // Only restart if we didn't explicitly stop
      try {
        recognition.start();
      } catch (error) {
        console.error('Error restarting recognition:', error);
        stopRecording();
      }
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    switch (event.error) {
      case 'not-allowed':
        originalText.textContent = 'Microphone access denied. Please check permissions.';
        break;
      case 'no-speech':
        originalText.textContent = 'No speech detected. Please try again.';
        break;
      default:
        originalText.textContent = `Error: ${event.error}`;
    }
    stopRecording();
  };

  function startRecording() {
    try {
      recognition.lang = sourceLanguage.value;
      recognition.start();
      isRecording = true;
      startButton.disabled = true;
      stopButton.disabled = false;
    } catch (error) {
      console.error('Error starting recognition:', error);
      alert('Error starting voice recognition. Please try again.');
    }
  }

  stopButton.addEventListener('click', () => {
    if (isRecording) {
      stopRecording();
    }
  });

  function stopRecording() {
    try {
      recognition.stop();
      isRecording = false;
      startButton.disabled = false;
      stopButton.disabled = true;
      startButton.classList.remove('listening');
      startButton.textContent = 'Start Recording';
      originalText.textContent = 'Recording stopped';
      
      // Clear the recognition object and create a new one
      if (recognition) {
        recognition.onend = null; // Remove the auto-restart
        recognition.abort(); // Force stop
      }
    } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  }

  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(translatedText.textContent)
      .then(() => {
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
          copyButton.textContent = 'Copy Translation';
        }, 2000);
      });
  });

  recognition.onresult = (event) => {
    console.log('Speech recognition result received');
    const transcript = Array.from(event.results)
      .map(result => result[0].transcript)
      .join('');
    
    originalText.textContent = transcript;
    
    // Only translate if we have text
    if (transcript.trim()) {
      console.log('Initiating translation for:', transcript);
      translateText(transcript.trim());
    }
  };

  async function translateText(text) {
    translatedText.textContent = 'Translating...';

    try {
      // Using a free translation API proxy
      const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLanguage.value.split('-')[0]}&tl=${targetLanguage.value}&dt=t&q=${encodeURIComponent(text)}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data[0] && data[0][0] && data[0][0][0]) {
        // Extract the translated text from the response
        const translatedResult = data[0].map(item => item[0]).join(' ');
        translatedText.textContent = translatedResult;
      } else {
        throw new Error('Invalid translation response');
      }
    } catch (error) {
      console.error('Translation error:', error);
      
      // Fallback to alternative translation API
      try {
        const backupResponse = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLanguage.value.split('-')[0]}|${targetLanguage.value}`);
        
        if (!backupResponse.ok) {
          throw new Error(`Backup translation failed: ${backupResponse.status}`);
        }

        const backupData = await backupResponse.json();
        if (backupData.responseData && backupData.responseData.translatedText) {
          translatedText.textContent = backupData.responseData.translatedText;
        } else {
          throw new Error('Invalid backup translation response');
        }
      } catch (backupError) {
        console.error('Backup translation error:', backupError);
        translatedText.textContent = 'Translation failed. Please try again.';
      }
    }
  }

  // Add a keyboard shortcut to stop recording (optional)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isRecording) {
      stopRecording();
    }
  });

  // Add this to your event listeners
  document.getElementById('manualTranslate').addEventListener('click', () => {
    const text = originalText.textContent;
    if (text && text.trim()) {
      translateText(text.trim());
    }
  });

  // Add speak button event listener
  speakButton.addEventListener('click', () => {
    const textToSpeak = translatedText.textContent;
    if (textToSpeak && !isSpeaking) {
      speakTranslatedText(textToSpeak);
    } else if (isSpeaking) {
      stopSpeaking();
    }
  });

  // Function to speak translated text
  function speakTranslatedText(text) {
    // Cancel any ongoing speech
    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set the language for speech based on target language
    utterance.lang = targetLanguage.value;
    
    // Handle speech events
    utterance.onstart = () => {
      isSpeaking = true;
      speakButton.innerHTML = 'Stop';
      speakButton.classList.add('speaking');
    };

    utterance.onend = () => {
      isSpeaking = false;
      speakButton.innerHTML = 'Speak';
      speakButton.classList.remove('speaking');
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      isSpeaking = false;
      speakButton.innerHTML = 'Speak';
      speakButton.classList.remove('speaking');
    };

    // Adjust speech parameters
    utterance.rate = 1.0; // Speed of speech (0.1 to 10)
    utterance.pitch = 1.0; // Pitch of speech (0 to 2)
    utterance.volume = 1.0; // Volume (0 to 1)

    // Start speaking
    speechSynthesis.speak(utterance);
  }

  // Function to stop speaking
  function stopSpeaking() {
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel();
      isSpeaking = false;
      speakButton.innerHTML = 'Speak';
      speakButton.classList.remove('speaking');
    }
  }

  // Add cleanup when popup closes
  window.addEventListener('unload', () => {
    stopSpeaking();
  });

  const voices = window.speechSynthesis.getVoices();
  console.log(voices);
}); 