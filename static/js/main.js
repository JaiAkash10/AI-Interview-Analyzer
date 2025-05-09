document.addEventListener('DOMContentLoaded', () => {
    const elements = {
        startButton: document.getElementById('startInterviewButton'),
        sections: {
            start: document.getElementById('start-section'),
            interview: document.getElementById('interview-section'),
            result: document.getElementById('result-section')
        },
        video: document.getElementById('videoElement'),
        videoContainer: document.getElementById('video-container'),
        question: document.getElementById('interview-question'),
        timers: {
            prep: document.getElementById('preparation-timer'),
            rec: document.getElementById('recording-timer')
        },
        timerDisplays: {
            prep: document.getElementById('prep-time'),
            rec: document.getElementById('rec-time')
        },
        status: document.getElementById('status-message'),
        result: document.getElementById('result'),
        nextQuestionButton: document.getElementById('nextQuestionButton'),
    };

    let mediaRecorder;
    let recordedChunks = [];
    const prepTime = 20;
    const recTime = 30;
    let currentTimer;
    let stream;

    async function setupCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: true
            });
            elements.video.srcObject = stream;

            const options = { mimeType: 'video/mp4' };
            mediaRecorder = new MediaRecorder(stream, options);

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                console.log("mediaRecorder.onstop called");
                const blob = new Blob(recordedChunks, { type: 'video/mp4' });
                console.log('Recording stopped. Blob size:', blob.size, 'bytes');
                if (blob.size > 0) {
                    uploadVideo(blob);
                } else {
                    showError("Recording failed: No data captured.");
                }
            };
        } catch (error) {
            console.error('Error accessing camera:', error);
            showError('Unable to access camera. Please ensure you have given permission and try again.');
        }
    }

    function stopCamera() {
        console.log("stopCamera called");
        if (stream) {
            try {
                stream.getTracks().forEach(track => track.stop());
                elements.video.srcObject = null;
                stream = null;
                console.log("Camera stopped");
            } catch (e) {
                console.log("Error inside of stopCamera", e);
            }
        } else {
            console.log("cameraStream is null");
        }
    }

    function showSection(section) {
        Object.values(elements.sections).forEach(s => s.classList.add('hidden'));
        elements.sections[section].classList.remove('hidden');
    }

    function updateTimer(timerElement, time) {
        const minutes = Math.floor(time / 60);
        const seconds = time % 60;
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function startTimer(phase) {
        let timeLeft = phase === 'prep' ? prepTime : recTime;
        updateTimer(elements.timerDisplays[phase], timeLeft);
        elements.timers[phase].classList.remove('hidden');

        return setInterval(() => {
            timeLeft--;
            updateTimer(elements.timerDisplays[phase], timeLeft);
            if (timeLeft <= 0) {
                clearInterval(currentTimer);
                elements.timers[phase].classList.add('hidden');
                if (phase === 'prep') startRecording();
                else stopRecording();
            }
        }, 1000);
    }

    function startPreparationTimer() {
        showSection('interview');
        elements.status.textContent = "Prepare your answer...";
        if (currentTimer) {
            clearInterval(currentTimer);
        }
        updateTimer(elements.timerDisplays.prep, prepTime);

        setupCamera(); 
        currentTimer = startTimer('prep');
        elements.nextQuestionButton.classList.remove('hidden');
    }

    function startRecording() {
        elements.videoContainer.classList.remove('hidden');
        recordedChunks = [];
        mediaRecorder.start(1000); // Record in 1-second chunks
        elements.status.textContent = "Recording in progress...";
        currentTimer = startTimer('rec');
        elements.nextQuestionButton.classList.add('hidden');
        console.log('Recording started');
    }

    function stopRecording() {
        console.log("stopRecording called");
        mediaRecorder.stop();
        elements.status.textContent = "Processing your response...";
        showSection('result');
        console.log('Recording stopped');
        stopCamera();
    }

    function uploadVideo(blob) {
        console.log('Uploading video. Blob size:', blob.size, 'bytes');
        const formData = new FormData();
        formData.append('video', blob, 'interview.mp4');
        elements.result.innerHTML = '<p>Processing video, please wait...</p>';

        fetch('/upload', {
            method: 'POST',
            body: formData
        })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || `HTTP error! status: ${response.status}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                console.log('Received data:', data);
                displayResults(data);
            })
            .catch(error => {
                console.error('Error:', error);
                showError(error.message);
            });
    }

    function displayResults(data) {
        let resultHTML = '<h3>Analysis Results:</h3>';
    
        if (data.error) {
            resultHTML += `<p class="error">Error: ${data.error}</p>`;
        } else {
            resultHTML += '<div class="score-grid">';
            const metrics = [
                { key: 'confidence', label: 'Confidence' },
                { key: 'clarity', label: 'Clarity' },
                { key: 'speech_rate', label: 'Speech Rate' },
                { key: 'eye_contact', label: 'Eye Contact' },
                { key: 'body_language', label: 'Body Language' },
                { key: 'voice_tone', label: 'Voice Tone' },
            ];
    
            metrics.forEach(metric => {
                const score = data.twelvelabs_data && data.twelvelabs_data[metric.key] !== undefined ? data.twelvelabs_data[metric.key] : 'N/A';
                resultHTML += `
                    <div class="score">
                        <span class="score-label">${metric.label}</span>
                        <span class="score-value">${score}/10</span>
                    </div>
                `;
            });
            resultHTML += '</div>';
    
            if (data.twelvelabs_data && data.twelvelabs_data.imp_points && data.twelvelabs_data.imp_points.length > 0) {
                resultHTML += '<h4>Key Points:</h4><ul>';
                data.twelvelabs_data.imp_points.forEach(point => {
                    resultHTML += `<li>${point}</li>`;
                });
                resultHTML += '</ul>';
            } else {
                resultHTML += '<p>No key points found in the analysis.</p>';
            }
    
            if (data.gemini_analysis) {
                resultHTML += '<h4>Gemini Analysis:</h4>';
                if (typeof data.gemini_analysis === 'string') {
                    resultHTML += `<p>${data.gemini_analysis}</p>`;
                } else if (typeof data.gemini_analysis === 'object' && data.gemini_analysis !== null) {
                    resultHTML += '<ul>';
                    for (const key in data.gemini_analysis) {
                        if (data.gemini_analysis.hasOwnProperty(key)) {
                            const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '); // Format key
                            resultHTML += `<li><strong>${formattedKey}:</strong> ${data.gemini_analysis[key]}</li>`;
                        }
                    }
                    resultHTML += '</ul>';
                } else {
                    resultHTML += '<p>No Gemini analysis available.</p>';
                }
            }
        }
    
        elements.result.innerHTML = resultHTML;
        if (!data.error && elements.nextQuestionButton) {
            elements.nextQuestionButton.classList.remove('hidden');
        }
    }

    function showError(message) {
        elements.result.innerHTML = `
            <p class="error">Error: ${message}</p>
            <p>Please try again. If the problem persists, ensure you're recording for the full time and that your video and audio are working correctly.</p>
        `;
    }

    elements.startButton.addEventListener('click', () => {
        setupCamera().then(() => {
            fetch('/get_question')
                .then(response => response.json())
                .then(data => {
                    console.log("Data from /get_question:", data);
                    if (data.message === "All questions have been asked.") {
                        alert("All questions have been asked.");
                        return;
                    }
                    console.log("Question from server:", data.question);
                    elements.question.textContent = data.question;
                    startPreparationTimer();
                })
                .catch(error => {
                    console.error('Error fetching question:', error);
                    showError('Failed to fetch interview question. Please try again.');
                });
        });
    });

    elements.nextQuestionButton.addEventListener('click', () => {
        elements.nextQuestionButton.classList.add('hidden');
        fetch('/get_question')
            .then(response => response.json())
            .then(data => {
                if (data.message === "All questions have been asked.") {
                    alert("All questions have been asked.");
                    showSection('start');
                    elements.videoContainer.classList.add('hidden');
                    clearInterval(currentTimer);
                    return;
                }
                elements.question.textContent = data.question;
                showSection('interview');
                elements.videoContainer.classList.add('hidden');
                startPreparationTimer();
            })
            .catch(error => {
                console.error('Error fetching next question:', error);
                showError('Failed to fetch next question. Please try again.');
            });
    });

});