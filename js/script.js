(function(){
  var $ = function(id){ return document.getElementById(id); };
  var apiKeyEl = $("apiKey");
  var rememberEl = $("rememberKey");
  var modeEl = $("mode");
  var promptEl = $("prompt");
  var sendBtn = $("sendBtn");
  var stopBtn = $("stopBtn");
  var clearChatBtn = $("clearChatBtn");
  var chatMessages = $("chatMessages");
  var streamEl = $("stream");
  var imageOptions = $("imageOptions");
  var imgCountEl = $("imgCount");
  var timeoutEl = $("timeoutSec");
  var modal = $("imageModal");
  var modalImg = $("modalImage");
  var modalCaption = $("modalCaption");
  var modelCountEl = $("modelCount");
  var refreshModelsBtn = $("refreshModels");
  
  // New model selector elements
  var modelSelectorBtn = $("modelSelectorBtn");
  var selectedModelText = $("selectedModelText");
  var modelSelectorModal = $("modelSelectorModal");
  var modelModalClose = $("modelModalClose");
  var modelSearchPopup = $("modelSearchPopup");
  var modelsGrid = $("modelsGrid");
  var filterButtons = document.querySelectorAll('.filter-btn');

  var currentController = null;
  var streamingActive = false;
  var timeoutHandle = null;
  var allModels = [];
  var freeModels = [];
  var selectedModel = null;
  var currentFilter = 'all';
  
  // Chat state
  var messageHistory = [];
  var currentTypingIndicator = null;

  try {
    var saved = localStorage.getItem("or_api_key");
    if (saved) { apiKeyEl.value = saved; rememberEl.checked = true; }
  } catch (e) {}

  rememberEl.addEventListener("change", function(){
    try {
      if (rememberEl.checked) localStorage.setItem("or_api_key", apiKeyEl.value || "");
      else localStorage.removeItem("or_api_key");
    } catch(e){}
  });
  apiKeyEl.addEventListener("input", function(){
    try { if (rememberEl.checked) localStorage.setItem("or_api_key", apiKeyEl.value || ""); } catch(e){}
  });

  modeEl.addEventListener("change", function(){
    var isImage = modeEl.value === "image";
    imageOptions.style.display = isImage ? "block" : "none";
  });

  clearChatBtn.addEventListener("click", function(){
    clearChat();
  });

  stopBtn.addEventListener("click", function(){
    abortActive("Stopped by user");
  });

  window.addEventListener("beforeunload", function(){ abortActive("Unload"); });

  // Modal functionality
  var closeBtn = document.querySelector(".modal-close");
  
  // Close modal when clicking the X
  closeBtn.addEventListener("click", function(){
    modal.style.display = "none";
  });
  
  // Close modal when clicking outside the image
  modal.addEventListener("click", function(event){
    if (event.target === modal) {
      modal.style.display = "none";
    }
  });
  
  // Close modal with Escape key
  document.addEventListener("keydown", function(event){
    if (event.key === "Escape" && modal.style.display === "block") {
      modal.style.display = "none";
    }
    if (event.key === "Escape" && modelSelectorModal.style.display === "block") {
      modelSelectorModal.style.display = "none";
    }
  });

  // Model selector modal functionality
  modelSelectorBtn.addEventListener("click", function(){
    modelSelectorModal.style.display = "block";
  });

  modelModalClose.addEventListener("click", function(){
    modelSelectorModal.style.display = "none";
  });

  // Close model selector modal when clicking outside
  modelSelectorModal.addEventListener("click", function(event){
    if (event.target === modelSelectorModal) {
      modelSelectorModal.style.display = "none";
    }
  });

  // Auto-resize textarea
  promptEl.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // Send message on Enter (but allow Shift+Enter for new lines)
  promptEl.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  // Send button click
  sendBtn.addEventListener("click", sendMessage);

  // Fetch and populate models
  function fetchModels() {
    fetch('https://openrouter.ai/api/v1/models')
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Failed to fetch models: ' + response.status);
        }
        return response.json();
      })
      .then(function(data) {
        allModels = data.data || [];
        // Filter for free models (both prompt and completion pricing are "0")
        freeModels = allModels.filter(function(model) {
          var pricing = model.pricing || {};
          return pricing.prompt === "0" && pricing.completion === "0";
        });
        
        // Sort models by name for better UX
        freeModels.sort(function(a, b) {
          return a.name.localeCompare(b.name);
        });
        
        populateModelSelector();
        modelCountEl.textContent = freeModels.length;
        console.log('Loaded ' + freeModels.length + ' free models');
      })
      .catch(function(error) {
        console.error('Error fetching models:', error);
        modelCountEl.textContent = 'Error';
      });
  }

  function populateModelSelector() {
    modelsGrid.innerHTML = '';
    
    freeModels.forEach(function(model) {
      var card = createModelCard(model);
      modelsGrid.appendChild(card);
    });
  }

  function createModelCard(model) {
    var card = document.createElement('div');
    card.className = 'model-card';
    card.dataset.modelId = model.id;
    
    // Determine model capabilities
    var capabilities = getModelCapabilities(model);
    var capabilityTags = capabilities.map(function(cap) {
      return '<span class="capability-tag ' + cap + '">' + cap.charAt(0).toUpperCase() + cap.slice(1) + '</span>';
    }).join('');
    
    // Get provider name
    var provider = model.id.split('/')[0] || 'Unknown';
    
    // Format pricing info
    var pricing = model.pricing || {};
    var pricingText = 'Free';
    if (pricing.prompt !== "0" || pricing.completion !== "0") {
      pricingText = 'Paid';
    }
    
    // Get context length
    var contextLength = model.context_length || 'Unknown';
    
    card.innerHTML = 
      '<div class="model-provider">' + provider + '</div>' +
      '<div class="model-name">' + model.name + '</div>' +
      '<div class="model-id">' + model.id + '</div>' +
      '<div class="model-description">' + (model.description || 'No description available') + '</div>' +
      '<div class="model-capabilities">' + capabilityTags + '</div>' +
      '<div class="model-pricing">' + pricingText + '</div>' +
      '<div class="model-context">Context: ' + contextLength + ' tokens</div>';
    
    // Add click handler
    card.addEventListener('click', function() {
      selectModel(model);
    });
    
    return card;
  }

  function getModelCapabilities(model) {
    var capabilities = ['text']; // All models support text
    
    // Check for image generation capabilities
    if (model.id.toLowerCase().includes('image') || 
        model.id.toLowerCase().includes('dall-e') ||
        model.id.toLowerCase().includes('midjourney') ||
        model.id.toLowerCase().includes('stable-diffusion') ||
        model.id.toLowerCase().includes('gemini') && model.id.toLowerCase().includes('image')) {
      capabilities.push('image');
    }
    
    // Check for multimodal capabilities
    if (model.id.toLowerCase().includes('vision') ||
        model.id.toLowerCase().includes('multimodal') ||
        model.id.toLowerCase().includes('gpt-4') ||
        model.id.toLowerCase().includes('gemini') ||
        model.id.toLowerCase().includes('claude')) {
      capabilities.push('multimodal');
    }
    
    return capabilities;
  }

  function selectModel(model) {
    selectedModel = model;
    selectedModelText.textContent = model.name;
    modelSelectorModal.style.display = 'none';
    
    // Remove previous selection
    var previousSelected = document.querySelector('.model-card.selected');
    if (previousSelected) {
      previousSelected.classList.remove('selected');
    }
    
    // Add selection to current card
    var currentCard = document.querySelector('[data-model-id="' + model.id + '"]');
    if (currentCard) {
      currentCard.classList.add('selected');
    }
  }

  // Search and filter functionality for popup
  function filterModelsPopup() {
    var searchTerm = modelSearchPopup.value.toLowerCase();
    var cards = document.querySelectorAll('.model-card');
    
    cards.forEach(function(card) {
      var modelId = card.dataset.modelId;
      var model = freeModels.find(function(m) { return m.id === modelId; });
      if (!model) return;
      
      var matchesSearch = searchTerm === '' || 
        model.name.toLowerCase().includes(searchTerm) ||
        model.id.toLowerCase().includes(searchTerm) ||
        (model.description && model.description.toLowerCase().includes(searchTerm)) ||
        model.id.split('/')[0].toLowerCase().includes(searchTerm);
      
      var matchesFilter = currentFilter === 'all' || 
        getModelCapabilities(model).includes(currentFilter);
      
      if (matchesSearch && matchesFilter) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  }

  // Add search functionality
  modelSearchPopup.addEventListener('input', filterModelsPopup);
  
  // Add filter button functionality
  filterButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      // Remove active class from all buttons
      filterButtons.forEach(function(b) { b.classList.remove('active'); });
      // Add active class to clicked button
      this.classList.add('active');
      // Update current filter
      currentFilter = this.dataset.filter;
      // Re-filter models
      filterModelsPopup();
    });
  });

  // Add refresh button functionality
  refreshModelsBtn.addEventListener('click', function() {
    modelCountEl.textContent = 'Loading...';
    modelsGrid.innerHTML = '<div style="text-align: center; color: #9aa0aa; padding: 20px;">Loading models...</div>';
    fetchModels();
  });

  // Load models on page load
  fetchModels();

  // Chat functionality
  function sendMessage() {
    var key = (apiKeyEl.value || "").trim();
    var mode = modeEl.value;
    var model = selectedModel ? selectedModel.id : (mode === "image" ? "google/gemini-2.5-flash-image-preview" : "openrouter/auto");
    var prompt = (promptEl.value || "").trim();

    if (!key) { alert("Please paste your OpenRouter API key."); return; }
    if (!prompt) { alert("Please write a message."); return; }
    if (!selectedModel) { alert("Please select a model from the model selector."); return; }

    // Add user message to chat
    addMessageToChat('user', prompt);
    
    // Clear input
    promptEl.value = '';
    promptEl.style.height = 'auto';
    
    // Show typing indicator
    showTypingIndicator();

    var n = 1; if (mode === "image"){ n = parseInt(imgCountEl.value || 1, 10); if (isNaN(n)) n = 1; n = Math.min(Math.max(n,1),4); }

    var doStream = !!streamEl.checked;
    var tsec = parseInt(timeoutEl.value || 30, 10); if (isNaN(tsec)) tsec = 30; tsec = Math.min(Math.max(tsec,5),120);

    // Warn if trying to generate multiple images with Google Gemini
    if (mode === "image" && n > 1 && model.toLowerCase().includes("gemini")) {
      console.warn("Warning: Google Gemini models typically only generate 1 image per request, regardless of the 'n' parameter.");
    }

    if (mode === "text") {
      runChat(key, model, prompt, doStream, tsec).catch(reportErr);
    } else {
      runImageViaChat(key, model, prompt, n, doStream, tsec).catch(reportErr);
    }
  }

  function addMessageToChat(role, content, images) {
    var messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + role;
    
    var contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    
    var timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = new Date().toLocaleTimeString();
    
    messageDiv.appendChild(contentDiv);
    
    // Add images if provided
    if (images && images.length > 0) {
      var imagesDiv = document.createElement('div');
      imagesDiv.className = 'message-images';
      
      images.forEach(function(src) {
        var img = document.createElement('img');
        img.src = src;
        img.alt = 'Generated image';
        img.addEventListener('click', function() {
          modalImg.src = src;
          modalCaption.textContent = "Generated image - Click outside or press Escape to close";
          modal.style.display = "block";
        });
        imagesDiv.appendChild(img);
      });
      
      messageDiv.appendChild(imagesDiv);
    }
    
    messageDiv.appendChild(timeDiv);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Store in message history
    messageHistory.push({
      role: role,
      content: content,
      images: images || [],
      timestamp: new Date()
    });
    
    // Return the message div for potential updates
    return messageDiv;
  }

  function showTypingIndicator() {
    hideTypingIndicator();
    
    var typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant typing-indicator';
    typingDiv.innerHTML = 
      '<div class="message-content">' +
        '<div class="typing-dots">' +
          '<span></span><span></span><span></span>' +
        '</div>' +
        'Assistant is typing...' +
      '</div>';
    
    chatMessages.appendChild(typingDiv);
    currentTypingIndicator = typingDiv;
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function hideTypingIndicator() {
    if (currentTypingIndicator) {
      currentTypingIndicator.remove();
      currentTypingIndicator = null;
    }
  }

  function clearChat() {
    chatMessages.innerHTML = '';
    messageHistory = [];
    hideTypingIndicator();
  }

  function reportErr(err){
    console.error(err);
    hideTypingIndicator();
    var msg = (err && err.message) ? err.message : String(err);
    addMessageToChat('assistant', "Error: " + msg);
    cleanupStreamState();
  }

  function beginStream(){
    abortActive();
    currentController = new AbortController();
    streamingActive = true;
    var tsec = parseInt(timeoutEl.value || 30, 10); if (isNaN(tsec)) tsec = 30;
    clearTimeout(timeoutHandle);
    timeoutHandle = setTimeout(function(){ abortActive("Timed out"); }, tsec * 1000);
    stopBtn.style.display = 'inline-block';
    sendBtn.disabled = true;
    promptEl.disabled = true;
  }

  function cleanupStreamState(){
    streamingActive = false;
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
    sendBtn.disabled = false;
    promptEl.disabled = false;
    stopBtn.style.display = 'none';
  }

  function abortActive(reason){
    if (currentController){ try { currentController.abort(); } catch(e){} }
    currentController = null;
    if (reason){ 
      hideTypingIndicator();
      addMessageToChat('assistant', "[Stream closed: " + reason + "]");
    }
    cleanupStreamState();
  }

  function getHeader(res, name){
    try { return res.headers.get(name) || ""; } catch(e){ return ""; }
  }

  function pickText(message){
    if (!message) return "";
    if (typeof message.content === 'string') return message.content;
    if (message.content && message.content.length){
      var parts = [];
      for (var i=0;i<message.content.length;i++){
        var p = message.content[i];
        if (p && p.type === 'output_text' && p.text) parts.push(p.text);
      }
      return parts.join('');
    }
    return "";
  }

  function extractImagesFromMessage(message){
    var out = [];
    if (!message) return out;
    if (message.content && message.content.length){
      for (var i=0;i<message.content.length;i++){
        var p = message.content[i];
        if (p && p.type === 'output_image' && p.image_url && p.image_url.url){ 
          out.push(p.image_url.url); 
        }
      }
    }
    if (message.images && message.images.length){
      for (var j=0;j<message.images.length;j++){
        var im = message.images[j];
        if (im && im.image_url && im.image_url.url) {
          out.push(im.image_url.url);
        }
      }
    }
    return out;
  }

  function parseJsonOrThrow(res){
    return res.text().then(function(text){
      var ct = getHeader(res, "content-type");
      if (ct.indexOf("application/json") === -1){
        throw new Error("Expected JSON but got \"" + ct + "\". Status " + res.status + ". Body:\n" + text.slice(0,1000));
      }
      try { return JSON.parse(text); }
      catch(e){ throw new Error("Failed to parse JSON. Status " + res.status + ". Body (truncated):\n" + text.slice(0,1000)); }
    });
  }

  function readSSE(res, onChunk, onDone){
    if (!res.ok){
      return res.text().then(function(t){ throw new Error("HTTP " + res.status + " – " + (t||"")); });
    }

    var ct = getHeader(res, "content-type");
    if (ct.indexOf("text/event-stream") === -1){
      // Not a stream, fall back to JSON
      return parseJsonOrThrow(res).then(function(json){ onChunk({ json: json, fallback: true }); if (onDone) onDone(); });
    }

    var reader = res.body.getReader();
    var decoder = new TextDecoder("utf-8");
    var buffer = "";

    function pump(){
      return reader.read().then(function(step){
        if (step.done){ if (onDone) onDone(); return; }
        buffer += decoder.decode(step.value, { stream: true });
        var idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1){
          var chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          var lines = chunk.split("\n");
          for (var i=0;i<lines.length;i++){
            var line = lines[i].trim();
            if (line.indexOf("data:") !== 0) continue;
            var data = line.slice(5).trim();
            if (data === "[DONE]") { if (onDone) onDone(); return; }
            try { var obj = JSON.parse(data); onChunk(obj); } catch(e){}
          }
        }
        return pump();
      }).catch(function(err){ if (onDone) onDone(err); });
    }
    return pump();
  }

  function runChat(key, model, prompt, stream, tsec){
    // Build messages array with conversation history
    var messages = [];
    
    // Add all previous messages to maintain context
    messageHistory.forEach(function(msg) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    });
    
    // Add the current user message
    messages.push({ role: "user", content: prompt });
    
    var body = { model: model, messages: messages, stream: stream };
    var url = "https://openrouter.ai/api/v1/chat/completions";

    if (!stream){
      return fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Title": "Local OpenRouter Playground"
        },
        body: JSON.stringify(body)
      }).then(parseJsonOrThrow).then(function(json){
        hideTypingIndicator();
        var content = pickText(json.choices && json.choices[0] && json.choices[0].message) || "";
        addMessageToChat('assistant', content || "[Empty response]");
        cleanupStreamState();
      });
    }

    beginStream();
    return fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "X-Title": "Local OpenRouter Playground"
      },
      body: JSON.stringify(body),
      signal: currentController.signal
    }).then(function(res){
      hideTypingIndicator();
      var assistantMessageDiv = null;
      var assistantContent = '';
      var assistantImages = [];
      
      return readSSE(res, function(chunk){
        if (chunk && chunk.json && chunk.fallback){
          // server returned JSON instead of SSE
          var content = pickText(chunk.json.choices && chunk.json.choices[0] && chunk.json.choices[0].message) || "";
          addMessageToChat('assistant', content || "[Empty response]");
          return;
        }
        var choice = chunk.choices && chunk.choices[0];
        var fin = choice ? choice.finish_reason : null;
        if (fin === "content_filter"){ 
          if (!assistantMessageDiv) {
            assistantMessageDiv = addMessageToChat('assistant', '[Blocked by content filter]');
          }
        }
        var delta = choice ? choice.delta : null;
        if (delta && typeof delta.content === 'string'){ 
          assistantContent += delta.content;
          if (!assistantMessageDiv) {
            // Create the message div once with empty content
            assistantMessageDiv = addMessageToChat('assistant', '');
          }
          // Update existing message
          var contentDiv = assistantMessageDiv.querySelector('.message-content');
          contentDiv.textContent = assistantContent;
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        if (delta && delta.content && delta.content.length){
          for (var i=0;i<delta.content.length;i++){
            var part = delta.content[i];
            if (part && part.type === 'output_text' && part.text){ 
              assistantContent += part.text;
              if (!assistantMessageDiv) {
                // Create the message div once with empty content
                assistantMessageDiv = addMessageToChat('assistant', '');
              }
              // Update existing message
              var contentDiv = assistantMessageDiv.querySelector('.message-content');
              contentDiv.textContent = assistantContent;
              chatMessages.scrollTop = chatMessages.scrollHeight;
            }
            if (part && part.type === 'output_image' && part.image_url && part.image_url.url){ 
              assistantImages.push(part.image_url.url);
            }
          }
        }
      }, function(){ 
        // Add images to the assistant message if any were generated
        if (assistantImages.length > 0 && assistantMessageDiv) {
          var imagesDiv = document.createElement('div');
          imagesDiv.className = 'message-images';
          
          assistantImages.forEach(function(src) {
            var img = document.createElement('img');
            img.src = src;
            img.alt = 'Generated image';
            img.addEventListener('click', function() {
              modalImg.src = src;
              modalCaption.textContent = "Generated image - Click outside or press Escape to close";
              modal.style.display = "block";
            });
            imagesDiv.appendChild(img);
          });
          
          assistantMessageDiv.appendChild(imagesDiv);
        }
        
        // Update message history with the complete assistant response
        if (assistantMessageDiv && assistantContent) {
          // Remove the temporary empty message from history if it exists
          var lastMessageIndex = messageHistory.length - 1;
          if (lastMessageIndex >= 0 && messageHistory[lastMessageIndex].role === 'assistant' && messageHistory[lastMessageIndex].content === '') {
            messageHistory[lastMessageIndex].content = assistantContent;
            messageHistory[lastMessageIndex].images = assistantImages;
          } else {
            messageHistory.push({
              role: 'assistant',
              content: assistantContent,
              images: assistantImages,
              timestamp: new Date()
            });
          }
        }
        
        cleanupStreamState(); 
      });
    }).catch(function(err){ cleanupStreamState(); throw err; });
  }

  function runImageViaChat(key, model, prompt, n, stream, tsec){
    // Build messages array with conversation history
    var messages = [];
    
    // Add all previous messages to maintain context
    messageHistory.forEach(function(msg) {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    });
    
    // Add the current user message
    messages.push({ role: "user", content: prompt });
    
    var body = { model: model, messages: messages, modalities: ["image","text"], n: n, stream: stream };
    var url = "https://openrouter.ai/api/v1/chat/completions";
    
    // Debug: Log the request being sent
    console.log("Sending image generation request:", JSON.stringify(body, null, 2));

    if (!stream){
      return fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-Title": "Local OpenRouter Playground"
        },
        body: JSON.stringify(body)
      }).then(parseJsonOrThrow).then(function(json){
        hideTypingIndicator();
        // Process all choices for multiple images
        var totalImages = [];
        if (json.choices && json.choices.length > 0) {
          for (var c = 0; c < json.choices.length; c++) {
            var message = json.choices[c] && json.choices[c].message;
            var imgs = extractImagesFromMessage(message);
            totalImages = totalImages.concat(imgs);
          }
        }
        if (totalImages.length === 0) {
          var txt = pickText(json.choices && json.choices[0] && json.choices[0].message);
          addMessageToChat('assistant', txt ? txt : "No images found in response.");
        } else {
          addMessageToChat('assistant', "Generated " + totalImages.length + " image(s):", totalImages);
        }
        cleanupStreamState();
      });
    }

    beginStream();
    return fetch(url, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "X-Title": "Local OpenRouter Playground"
      },
      body: JSON.stringify(body),
      signal: currentController.signal
    }).then(function(res){
      hideTypingIndicator();
      var assistantMessageDiv = null;
      var assistantContent = '';
      var assistantImages = [];
      
      return readSSE(res, function(chunk){
        // Debug logging for image chunks
        if (chunk && chunk.choices) {
          console.log("Image streaming chunk:", JSON.stringify(chunk, null, 2));
        }
        
        if (chunk && chunk.json && chunk.fallback){
          // Handle non-streaming response
          if (chunk.json.choices && chunk.json.choices.length > 0) {
            for (var c = 0; c < chunk.json.choices.length; c++) {
              var message = chunk.json.choices[c] && chunk.json.choices[c].message;
              var imgs = extractImagesFromMessage(message);
              assistantImages = assistantImages.concat(imgs);
            }
            if (assistantImages.length === 0) {
              var txt = pickText(chunk.json.choices[0] && chunk.json.choices[0].message);
              addMessageToChat('assistant', txt ? txt : "No images found in response.");
            } else {
              addMessageToChat('assistant', "Generated " + assistantImages.length + " image(s):", assistantImages);
            }
          }
          return;
        }
        
        // Handle streaming response - process all choices
        if (chunk && chunk.choices && chunk.choices.length > 0) {
          for (var choiceIndex = 0; choiceIndex < chunk.choices.length; choiceIndex++) {
            var choice = chunk.choices[choiceIndex];
            var fin = choice ? choice.finish_reason : null;
            if (fin === "content_filter"){ 
              if (!assistantMessageDiv) {
                assistantMessageDiv = addMessageToChat('assistant', '[Blocked by content filter]');
              }
            }
            var delta = choice ? choice.delta : null;
            
            // Check for images in the choice itself (not just delta content)
            if (choice && choice.message && choice.message.images){
              console.log("Found images in choice.message.images:", choice.message.images);
              for (var k=0;k<choice.message.images.length;k++){
                var img = choice.message.images[k];
                if (img && img.image_url && img.image_url.url){
                  console.log("Adding image from choice.message.images:", img.image_url.url);
                  assistantImages.push(img.image_url.url);
                }
              }
            }
            
            // Check for images in delta.images (the actual structure from the API)
            if (delta && delta.images && delta.images.length){
              console.log("Found images in delta.images:", delta.images);
              for (var m=0;m<delta.images.length;m++){
                var img = delta.images[m];
                if (img && img.type === 'image_url' && img.image_url && img.image_url.url){
                  console.log("Adding image from delta.images:", img.image_url.url);
                  assistantImages.push(img.image_url.url);
                }
              }
            }
            
            if (delta && delta.content && delta.content.length){
              for (var i=0;i<delta.content.length;i++){
                var part = delta.content[i];
                if (part && part.type === 'output_text' && part.text){ 
                  assistantContent += part.text;
                  if (!assistantMessageDiv) {
                    // Create the message div once with empty content
                    assistantMessageDiv = addMessageToChat('assistant', '');
                  }
                  // Update existing message
                  var contentDiv = assistantMessageDiv.querySelector('.message-content');
                  contentDiv.textContent = assistantContent;
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                if (part && part.type === 'output_image' && part.image_url && part.image_url.url){ 
                  console.log("Adding image from delta content:", part.image_url.url);
                  assistantImages.push(part.image_url.url);
                }
              }
            }
          }
        }
      }, function(){ 
        // Add images to the assistant message if any were generated
        if (assistantImages.length > 0 && assistantMessageDiv) {
          var imagesDiv = document.createElement('div');
          imagesDiv.className = 'message-images';
          
          assistantImages.forEach(function(src) {
            var img = document.createElement('img');
            img.src = src;
            img.alt = 'Generated image';
            img.addEventListener('click', function() {
              modalImg.src = src;
              modalCaption.textContent = "Generated image - Click outside or press Escape to close";
              modal.style.display = "block";
            });
            imagesDiv.appendChild(img);
          });
          
          assistantMessageDiv.appendChild(imagesDiv);
        }
        
        // Update message history with the complete assistant response
        if (assistantMessageDiv && assistantContent) {
          // Remove the temporary empty message from history if it exists
          var lastMessageIndex = messageHistory.length - 1;
          if (lastMessageIndex >= 0 && messageHistory[lastMessageIndex].role === 'assistant' && messageHistory[lastMessageIndex].content === '') {
            messageHistory[lastMessageIndex].content = assistantContent;
            messageHistory[lastMessageIndex].images = assistantImages;
          } else {
            messageHistory.push({
              role: 'assistant',
              content: assistantContent,
              images: assistantImages,
              timestamp: new Date()
            });
          }
        }
        
        cleanupStreamState(); 
      });
    }).catch(function(err){ cleanupStreamState(); throw err; });
  }
})();