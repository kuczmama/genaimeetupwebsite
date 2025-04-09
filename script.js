// Set current year in footer
document.getElementById('current-year').textContent = new Date().getFullYear();

// Scroll progress indicator
window.addEventListener('scroll', function () {
    const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (window.scrollY / windowHeight) * 100;
    document.querySelector('.scroll-progress').style.width = scrolled + '%';
});

// Scroll animation for elements
const fadeElements = document.querySelectorAll('section h2, .join-options');

// Add fade-in class to elements
fadeElements.forEach(el => {
    el.classList.add('fade-in');
});

// Check if elements are in viewport and add visible class
function checkFadeElements() {
    fadeElements.forEach(el => {
        const elementTop = el.getBoundingClientRect().top;
        const elementVisible = 150;

        if (elementTop < window.innerHeight - elementVisible) {
            el.classList.add('visible');
        }
    });
}

// Run on scroll and on load
window.addEventListener('scroll', checkFadeElements);
window.addEventListener('load', checkFadeElements);

// Initialize
document.addEventListener('DOMContentLoaded', function () {
    // Ensure page starts at the top
    if (!window.location.hash) {
        window.scrollTo(0, 0);
    }

    // Run initial check for fade elements
    checkFadeElements();

    // Initialize counter animation
    initCounters();

    // Initialize typing animations
    initTypewriterEffect();

    // Navigation scroll effect
    window.addEventListener('scroll', function () {
        const nav = document.querySelector('.site-nav');
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    document.querySelector('.mobile-menu-btn').addEventListener('click', function () {
        document.querySelector('.nav-links').classList.toggle('active');
    });

    // Close mobile menu when clicking a link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', function () {
            document.querySelector('.nav-links').classList.remove('active');
        });
    });

    // Enhanced neural network particle animation with monochrome + orange highlight
    particlesJS('particles-js', {
        "particles": {
            "number": {
                "value": 180,
                "density": {
                    "enable": true,
                    "value_area": 800
                }
            },
            "color": {
                "value": ["#888888", "#aaaaaa", "#ff4081", "#cccccc"]
            },
            "shape": {
                "type": "circle",
                "stroke": {
                    "width": 0,
                    "color": "#000000"
                }
            },
            "opacity": {
                "value": 0.6,
                "random": true,
                "anim": {
                    "enable": true,
                    "speed": 1,
                    "opacity_min": 0.2,
                    "sync": false
                }
            },
            "size": {
                "value": 3,
                "random": true,
                "anim": {
                    "enable": false,
                    "speed": 40,
                    "size_min": 0.1,
                    "sync": false
                }
            },
            "line_linked": {
                "enable": true,
                "distance": 200,
                "color": "#888888",
                "opacity": 0.5,
                "width": 1
            },
            "move": {
                "enable": true,
                "speed": 2.5,
                "direction": "none",
                "random": true,
                "straight": false,
                "out_mode": "out",
                "bounce": false,
                "attract": {
                    "enable": true,
                    "rotateX": 600,
                    "rotateY": 1200
                }
            }
        },
        "interactivity": {
            "detect_on": "canvas",
            "events": {
                "onhover": {
                    "enable": true,
                    "mode": "grab"
                },
                "onclick": {
                    "enable": true,
                    "mode": "push"
                },
                "resize": true
            },
            "modes": {
                "grab": {
                    "distance": 180,
                    "line_linked": {
                        "opacity": 1,
                        "color": "#ff4081"
                    }
                },
                "bubble": {
                    "distance": 100,
                    "size": 5,
                    "duration": 0.4,
                    "opacity": 1,
                    "speed": 3
                },
                "repulse": {
                    "distance": 100,
                    "duration": 0.4
                },
                "push": {
                    "particles_nb": 8
                },
                "remove": {
                    "particles_nb": 2
                }
            }
        },
        "retina_detect": true
    });

    // Initialize particle grabbing effect
    initializeParticleGrabbing();

    // Create additional neural network layer effect
    setTimeout(createNeuralNetworkLayers, 500);

    // Fetch content
    fetchUpcomingMeetups();
    fetchYouTubeVideos();
});

// Typewriter effect for code-styled text
function initTypewriterEffect() {
    // Type the main tagline immediately
    const taglineElement = document.querySelector('#tagline .typing-text');
    if (taglineElement) {
        typeText(taglineElement, 0, 30);
    }

    // Find elements that need alternating text animation
    const alternatingElements = document.querySelectorAll('.typing-text[data-animate-alternate="true"]');
    alternatingElements.forEach(element => {
        startAlternatingTextAnimation(element);
    });

    // Set up intersection observer for other typing elements
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Start typing when the element is visible
                const typingElement = entry.target;

                // Skip elements with alternating animation
                if (!typingElement.hasAttribute('data-animate-alternate')) {
                    typeText(typingElement, 0, 50);
                }

                // Unobserve after starting the animation
                observer.unobserve(typingElement);
            }
        });
    }, { threshold: 0.5 });

    // Observe all typing-text elements except the main tagline and alternating ones
    document.querySelectorAll('.typing-text:not(#tagline .typing-text):not([data-animate-alternate="true"])').forEach(elem => {
        observer.observe(elem);
    });
}

// Function to handle alternating text animation with backspace effect
function startAlternatingTextAnimation(element) {
    const text1 = element.getAttribute('data-text');
    const text2 = element.getAttribute('data-alternate-text');
    let currentText = text1;
    let isTyping = true;
    let charIndex = 0;

    // Clear any existing content and remove cursor if exists
    element.innerHTML = '';
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    element.appendChild(cursor);

    function animateText() {
        if (isTyping) {
            // Typing phase
            if (charIndex < currentText.length) {
                element.insertBefore(document.createTextNode(currentText.charAt(charIndex)), cursor);
                charIndex++;
                setTimeout(animateText, 100); // Typing speed
            } else {
                // Typing complete, wait before backspacing
                isTyping = false;
                setTimeout(animateText, 2000); // Wait 2 seconds before backspacing
            }
        } else {
            // Backspacing phase
            if (charIndex > 0) {
                // Remove the last character
                charIndex--;
                element.textContent = currentText.substring(0, charIndex);
                element.appendChild(cursor);
                setTimeout(animateText, 50); // Backspacing speed (faster than typing)
            } else {
                // Backspacing complete, switch text and start typing
                isTyping = true;
                currentText = currentText === text1 ? text2 : text1;
                setTimeout(animateText, 200); // Small pause before typing new word
            }
        }
    }

    // Start the animation
    animateText();
}

function typeText(element, index, speed) {
    const text = element.getAttribute('data-text');

    // Clear any existing content and remove cursor if exists
    if (index === 0) {
        element.innerHTML = '';
        const oldCursor = element.querySelector('.cursor');
        if (oldCursor) oldCursor.remove();
    }

    if (index < text.length) {
        element.innerHTML += text.charAt(index);
        index++;
        setTimeout(() => typeText(element, index, speed), speed);
    } else {
        // Add blinking cursor after typing finishes, but only if not inside a button
        const isInsideButton = element.closest('.btn') !== null;
        if (!isInsideButton) {
            const cursor = document.createElement('span');
            cursor.className = 'cursor';
            element.appendChild(cursor);
        }
    }
}

// Counter animation for stat values
function initCounters() {
    const counters = document.querySelectorAll('.stat-value[data-counter]');

    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-counter'));
        const duration = 2000; // Animation duration in milliseconds
        const startTime = performance.now();
        const startValue = 0;

        function updateCounter(currentTime) {
            const elapsedTime = currentTime - startTime;

            if (elapsedTime < duration) {
                const progress = elapsedTime / duration;
                // Use easeOutQuart for a more natural feel
                const easedProgress = 1 - Math.pow(1 - progress, 4);
                const currentValue = Math.floor(easedProgress * target);

                // Format with commas for thousands
                counter.textContent = currentValue >= 1000 ?
                    currentValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "+" :
                    currentValue + "+";

                requestAnimationFrame(updateCounter);
            } else {
                // Ensure we end exactly at the target value
                counter.textContent = target >= 1000 ?
                    target.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "+" :
                    target + "+";
            }
        }

        requestAnimationFrame(updateCounter);
    });
}

// Fetch upcoming meetups from iCal feed with widget-like display
async function fetchUpcomingMeetups() {
    const eventsContainer = document.getElementById('upcoming-events-row');

    try {
        // Show loading message
        eventsContainer.innerHTML = '<div class="events-loading">Loading upcoming events...</div>';

        // Use a reliable CORS proxy to access the meetup iCal feed
        const corsProxy = 'https://corsproxy.io/?';
        const icalUrl = encodeURIComponent('https://www.meetup.com/gen-ai/events/ical/');

        const response = await fetch(corsProxy + icalUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status}`);
        }

        const data = await response.text();

        // Parse the ICS data using ical.js
        const jcalData = ICAL.parse(data);
        const comp = new ICAL.Component(jcalData);
        const vevents = comp.getAllSubcomponents('vevent');

        // Clear loading message
        eventsContainer.innerHTML = '';

        // Process events - display 3 upcoming events
        const today = new Date();
        let upcomingEvents = [];

        vevents.forEach(vevent => {
            const event = new ICAL.Event(vevent);
            const eventDate = event.startDate.toJSDate();

            const vEvent = vevent.jCal[1]; // Assuming the first (and likely only) VEVENT

            let eventUrl = null;
            if (vEvent && Array.isArray(vEvent)) {
                for (const property of vEvent) {
                    if (Array.isArray(property) && property[0] === 'url') {
                        eventUrl = property[3]; // The URL is at index 3
                        break; // Found the URL, so exit the loop
                    }
                }
            }

            // Only add future events or events today
            if (eventDate >= today) {
                upcomingEvents.push({
                    title: event.summary,
                    link: eventUrl ? eventUrl : '#',
                    date: eventDate,
                    month: eventDate.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
                    day: eventDate.getDate(),
                    formattedDate: eventDate.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    }),
                    formattedTime: eventDate.toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                    })
                });
            }
        });

        // Sort by date (nearest first)
        upcomingEvents.sort((a, b) => a.date - b.date);

        // Take first 5 events
        upcomingEvents = upcomingEvents.slice(0, 5);

        if (upcomingEvents.length > 0) {
            // Create a widget-like container
            const widgetContainer = document.createElement('div');
            widgetContainer.className = 'meetup-events-widget';

            upcomingEvents.forEach(event => {
                const eventCard = document.createElement('div');
                eventCard.className = 'event-card-widget';
                eventCard.style.cursor = 'pointer';
                
                // Add event listener to navigate to the event page when clicked
                eventCard.addEventListener('click', function() {
                    console.log(event);
                    console.log(event.link);
                    if (event.link && event.link !== '#') {
                        window.open(event.link, '_blank', 'noopener,noreferrer');
                    }
                });
                
                eventCard.innerHTML = `
                    <div class="event-date-widget">
                        <span class="month">${event.month}</span>
                        <span class="day">${event.day}</span>
                    </div>
                    <div class="event-details-widget">
                        <h4>${event.title}</h4>
                        <p>
                            <i class="far fa-clock"></i> ${event.formattedTime}<br>
                            <i class="far fa-calendar-alt"></i> ${event.formattedDate}</p>
                    </div>
                `;

                widgetContainer.appendChild(eventCard);
            });

            eventsContainer.appendChild(widgetContainer);

            // Initialize typing effect for newly added elements
            document.querySelectorAll('.event-card-widget .typing-text').forEach(elem => {
                typeText(elem, 0, 50);
            });
        } else {
            // No upcoming events
            eventsContainer.innerHTML = `
    <div class="no-events">
        <p>No upcoming events currently scheduled. Check back soon!</p>
        <a href="https://www.meetup.com/gen-ai/events/" class="btn btn-secondary btn-sm" target="_blank" rel="noopener noreferrer">
        Check Meetup Page
        </a>
    </div>
    `;
        }
    } catch (error) {
        console.error('Error fetching meetup events:', error);
        eventsContainer.innerHTML = `
    <div class="events-error">
    <p>Couldn't load upcoming events. Please check the <a href="https://www.meetup.com/gen-ai/events/" target="_blank" rel="noopener noreferrer">Meetup page</a> for the latest events.</p>
    </div>
`;
    }
}

// Optimized YouTube video loading - simplified to show 6 real latest videos
function fetchYouTubeVideos() {
    const youtubeGallery = document.getElementById('youtube-gallery');
    if (!youtubeGallery) return;

    // Helper function to extract video ID from YouTube URL
    function getYoutubeVideoId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    }

    // Video data array
    const videos = [
        {
            id: 'yWXQUo4zeS0',
            title: 'Multi-Agent Applications',
            date: 'April 6, 2025'
        },
        {
            id: 'B3P8dk5INNQ',
            title: 'Meta releases Llama 4!',
            date: 'April 6, 2025'
        },
        {
            id: '0eAUt-fyIVM',
            title: '2025 is the Year of Agents',
            date: 'April 4, 2025'
        },
        {
            id: 'Zhi1MNa2Y6U',
            title: 'Building AI Agents Without Code | Interview with Langflow',
            date: 'April 4, 2025'
        },
        {
            id: 'Hu05nWqEVRc',
            title: 'What will the world look like in 2035?',
            date: 'April 2, 2025'
        },
        {
            id: 'FTnR1tpvHNo',
            title: 'What even is AGI?',
            date: 'March 28, 2025'
        }
    ];

    // Generate HTML with thumbnails that open embedded players when clicked
    let html = '';

    videos.forEach(video => {
        html += `
<div class="video-item">
    <div class="video-thumbnail-container" data-video-id="${video.id}">
    <img src="https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg" alt="${video.title}" class="video-thumbnail" loading="lazy">
    <div class="video-play-button">
        <i class="fas fa-play"></i>
    </div>
    </div>
    <div class="video-info">
    <h3 class="video-title">${video.title}</h3>
    <div class="video-metadata">
        <div class="video-date">
        <i class="far fa-calendar-alt"></i>
        <span>${video.date}</span>
        </div>
    </div>
    </div>
</div>
`;
    });

    youtubeGallery.innerHTML = html;

    // Add click event listeners to all thumbnail containers
    document.querySelectorAll('.video-thumbnail-container').forEach(container => {
        container.addEventListener('click', function () {
            const videoId = this.getAttribute('data-video-id');

            // If there's already an iframe, remove it (toggle behavior)
            if (this.querySelector('iframe')) {
                this.innerHTML = `
        <img src="https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg" alt="YouTube video thumbnail" class="video-thumbnail" loading="lazy">
        <div class="video-play-button">
        <i class="fas fa-play"></i>
        </div>
    `;
                return;
            }

            // Replace thumbnail with embedded iframe
            this.innerHTML = `
    <iframe 
        width="100%" 
        height="100%" 
        src="https://www.youtube.com/embed/${videoId}?autoplay=1" 
        title="YouTube video player" 
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen>
    </iframe>
    `;
        });
    });
}

// Initialize particle grabbing effect
function initializeParticleGrabbing() {
    // Get canvas and pJS instance
    const canvas = document.querySelector('#particles-js canvas');
    if (!canvas || !pJSDom || !pJSDom[0]) {
        console.error('Particles.js not initialized properly');
        return;
    }

    const pJS = pJSDom[0].pJS;
    if (!pJS) {
        console.error('Cannot access pJS instance');
        return;
    }

    // Variables to track grabbed particles
    let grabbedParticles = [];
    let mousePosition = { x: 0, y: 0 };
    let isMouseOnCanvas = false;

    // Store initial properties for each particle
    pJS.particles.array.forEach(p => {
        p.original = {
            x: p.x,
            y: p.y,
            vx: p.vx,
            vy: p.vy,
            color: JSON.parse(JSON.stringify(p.color))
        };
    });

    // Track mouse position
    canvas.addEventListener('mouseenter', function () {
        isMouseOnCanvas = true;
    });

    canvas.addEventListener('mouseleave', function () {
        isMouseOnCanvas = false;
        // Release all particles
        grabbedParticles.forEach(p => {
            p.grabbed = false;
            p.color.rgb = p.original.color.rgb;

            // Set velocity to return to original position
            const returnFactor = 0.05;
            p.vx = (p.original.x - p.x) * returnFactor;
            p.vy = (p.original.y - p.y) * returnFactor;
            p.returning = true;
        });

        grabbedParticles = [];
    });

    canvas.addEventListener('mousemove', function (event) {
        const rect = canvas.getBoundingClientRect();
        mousePosition.x = event.clientX - rect.left;
        mousePosition.y = event.clientY - rect.top;

        if (!isMouseOnCanvas) return;

        // Check for particles to grab
        pJS.particles.array.forEach(p => {
            const dx = p.x - mousePosition.x;
            const dy = p.y - mousePosition.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Within grabbing distance
            if (distance < 120) {
                if (!p.grabbed) {
                    p.grabbed = true;
                    p.color.rgb = {
                        r: 255,
                        g: 123,
                        b: 0
                    };
                    grabbedParticles.push(p);
                }

                // Calculate elastic effect for grabbed particles
                // Stronger pull when closer to cursor
                const elasticFactor = Math.min(0.3, 0.5 * (1 - distance / 120));
                const targetX = mousePosition.x;
                const targetY = mousePosition.y;

                // Direct position adjustment for closer particles (snap effect)
                if (distance < 30) {
                    p.x += (targetX - p.x) * 0.2;
                    p.y += (targetY - p.y) * 0.2;
                } else {
                    p.vx = (targetX - p.x) * elasticFactor;
                    p.vy = (targetY - p.y) * elasticFactor;
                }
            }
            // If particle is grabbed but now too far, release it
            else if (p.grabbed && distance > 150) {
                p.grabbed = false;
                // Restore original color
                p.color.rgb = p.original.color.rgb;
                // Remove from grabbed particles
                grabbedParticles = grabbedParticles.filter(gp => gp !== p);

                // Set velocity to return to original position with stronger return force
                const returnFactor = 0.08;
                p.vx = (p.original.x - p.x) * returnFactor;
                p.vy = (p.original.y - p.y) * returnFactor;
                p.returning = true;
            }
        });
    });

    // Override the particlesUpdate function
    const originalParticlesUpdate = pJS.fn.particlesUpdate;
    pJS.fn.particlesUpdate = function () {
        for (let i = 0; i < pJS.particles.array.length; i++) {
            const p = pJS.particles.array[i];

            if (p.grabbed) {
                // Already handled in mousemove
            } else if (p.returning) {
                // Check if particle has returned close enough to original position
                const dx = p.x - p.original.x;
                const dy = p.y - p.original.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < 1) {
                    p.returning = false;
                    p.x = p.original.x;
                    p.y = p.original.y;
                    p.vx = p.original.vx;
                    p.vy = p.original.vy;
                }
            } else {
                // Regular particle movement
                if (pJS.particles.move.enable) {
                    const ms = pJS.particles.move.speed / 2;
                    p.x += p.vx * ms;
                    p.y += p.vy * ms;
                }
            }
        }

        // Check for and draw connections between particles
        if (pJS.particles.line_linked.enable || pJS.particles.move.attract.enable) {
            for (let i = 0; i < pJS.particles.array.length; i++) {
                const p1 = pJS.particles.array[i];

                // Connect with other particles
                for (let j = i + 1; j < pJS.particles.array.length; j++) {
                    const p2 = pJS.particles.array[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    // If particles are close enough, draw a line between them
                    if (dist <= pJS.particles.line_linked.distance) {
                        if (pJS.particles.line_linked.enable) {
                            const opacity_line = pJS.particles.line_linked.opacity - (dist / pJS.particles.line_linked.distance);

                            if (opacity_line > 0) {
                                // Check if either particle is grabbed - if so, color the line
                                let lineColor = pJS.particles.line_linked.color_rgb_line;

                                if (p1.grabbed || p2.grabbed) {
                                    lineColor = {
                                        r: 255,
                                        g: 123,
                                        b: 0
                                    };
                                }

                                pJS.canvas.ctx.strokeStyle = `rgba(${lineColor.r},${lineColor.g},${lineColor.b},${opacity_line})`;
                                pJS.canvas.ctx.lineWidth = pJS.particles.line_linked.width;
                                pJS.canvas.ctx.beginPath();
                                pJS.canvas.ctx.moveTo(p1.x, p1.y);
                                pJS.canvas.ctx.lineTo(p2.x, p2.y);
                                pJS.canvas.ctx.stroke();
                                pJS.canvas.ctx.closePath();
                            }
                        }
                    }
                }
            }
        }
    };

    console.log('Enhanced particle grab effect initialized');
}

// Create additional neural network layers for a deeper effect
function createNeuralNetworkLayers() {
    const canvas = document.querySelector('#particles-js canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Get the background particles instance
    const pJS = pJSDom[0].pJS;
    if (!pJS) return;

    // Create additional connection points that act as hidden layers
    const hiddenNodes = [];
    const numHiddenNodes = 12;

    // Create hidden layer nodes
    for (let i = 0; i < numHiddenNodes; i++) {
        hiddenNodes.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: 1 + Math.random() * 2,
            xSpeed: (Math.random() - 0.5) * 0.8,
            ySpeed: (Math.random() - 0.5) * 0.8,
            connections: []
        });
    }

    // Randomly connect hidden nodes to create a neural network structure
    hiddenNodes.forEach(node => {
        // Each node connects to 2-4 other nodes
        const numConnections = 2 + Math.floor(Math.random() * 3);

        // Create random connections to other nodes
        for (let i = 0; i < numConnections; i++) {
            const targetIndex = Math.floor(Math.random() * hiddenNodes.length);
            if (hiddenNodes[targetIndex] !== node) {
                node.connections.push(targetIndex);
            }
        }
    });

    // Function to animate additional neural connections
    function animateNeuralLayers() {
        if (!document.querySelector('#particles-js')) return;

        // Move hidden nodes
        hiddenNodes.forEach(node => {
            node.x += node.xSpeed;
            node.y += node.ySpeed;

            // Bounce off edges
            if (node.x < 0 || node.x > canvas.width) node.xSpeed *= -1;
            if (node.y < 0 || node.y > canvas.height) node.ySpeed *= -1;
        });

        // Draw connections between hidden nodes
        ctx.save();

        // Draw hidden node connections behind the regular particles
        hiddenNodes.forEach((node, idx) => {
            node.connections.forEach(targetIdx => {
                const target = hiddenNodes[targetIdx];
                const dx = node.x - target.x;
                const dy = node.y - target.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Only draw if within reasonable distance
                if (dist < 250) {
                    const opacity = 0.15 * (1 - dist / 250);

                    ctx.strokeStyle = `rgba(170, 170, 170, ${opacity})`;
                    ctx.lineWidth = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(target.x, target.y);
                    ctx.stroke();
                }
            });
        });

        // Occasionally create additional "signal" pulses traveling along connections
        if (Math.random() < 0.02) {
            const sourceNodeIdx = Math.floor(Math.random() * hiddenNodes.length);
            const sourceNode = hiddenNodes[sourceNodeIdx];

            if (sourceNode.connections.length > 0) {
                const targetNodeIdx = sourceNode.connections[Math.floor(Math.random() * sourceNode.connections.length)];
                const targetNode = hiddenNodes[targetNodeIdx];

                // Create pulse animation along this connection
                let progress = 0;

                const animatePulse = () => {
                    if (progress >= 1) return;

                    progress += 0.03;

                    // Calculate position along the line
                    const x = sourceNode.x + (targetNode.x - sourceNode.x) * progress;
                    const y = sourceNode.y + (targetNode.y - sourceNode.y) * progress;

                    // Draw pulse
                    ctx.fillStyle = '#ff4081';
                    ctx.beginPath();
                    ctx.arc(x, y, 2, 0, Math.PI * 2);
                    ctx.fill();

                    requestAnimationFrame(animatePulse);
                };

                animatePulse();
            }
        }

        ctx.restore();

        requestAnimationFrame(animateNeuralLayers);
    }

    // Start the animation
    animateNeuralLayers();
}

// Handle navigation highlighting based on scroll position
function highlightNavOnScroll() {
    const sections = document.querySelectorAll('section, #hero');
    const navLinks = document.querySelectorAll('.nav-links a');

    // Get current scroll position
    let scrollY = window.scrollY;

    // Find which section is currently in view
    sections.forEach(section => {
        const sectionTop = section.offsetTop - 100; // Offset for header
        const sectionHeight = section.offsetHeight;
        const sectionId = section.getAttribute('id');

        if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
            // Remove active class from all links
            navLinks.forEach(link => {
                link.classList.remove('active');
            });

            // Add active class to current section link
            const activeLink = document.querySelector(`.nav-links a[href="#${sectionId}"]`);
            if (activeLink) {
                activeLink.classList.add('active');
            }
        }
    });
}

// Add scroll event listener for navigation highlighting
window.addEventListener('scroll', highlightNavOnScroll);

// Initialize navigation highlighting
document.addEventListener('DOMContentLoaded', function () {
    highlightNavOnScroll();
});

// Handle smooth scrolling with offset for navigation links
document.addEventListener('DOMContentLoaded', function() {
    // Get all navigation links that link to an ID
    const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    
    // Add click event listener to each link
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // Prevent default anchor behavior
            e.preventDefault();
            
            // Get the target element
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                // Calculate header height - can be adjusted as needed
                const headerOffset = 52;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                // Scroll to the target with offset
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
});