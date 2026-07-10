// ================================================================
// BACCARAT MULTI-AI ENSEMBLE ULTRA v3.0 - FULL CODE 100%
// GỘP TOÀN BỘ: ĐOẠN ĐẦU + AI MODULES + PREDICTOR + API + WEBSOCKET + TABLE PREDICTOR + SỬA LỖI BÀN 3
// KHÔNG THIẾU BẤT KỲ DÒNG NÀO
// ================================================================

const axios = require('axios');
const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const EventEmitter = require('events');

// ======================
// CẤU HÌNH BAN ĐẦU
// ======================
const BASE = "https://aibcr.me";
const LOGIN_URL = `${BASE}/login`;
const LOBBY_URL = `${BASE}/ae/lobby`;
const GETNEWRESULT_URL = `${BASE}/baccarat/getnewresult`;

const USERNAME = "tiendatoce1232";
const PASSWORD = "tiendatoceee1";

const agent = new https.Agent({ rejectUnauthorized: false });
let cookieJar = '';
let baccaratData = [];
let lastUpdate = null;

// ======================
// SESSION AXIOS
// ======================
const session = axios.create({
    baseURL: BASE,
    timeout: 30000,
    httpsAgent: agent,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
    }
});

session.interceptors.request.use(config => {
    if (cookieJar) config.headers.Cookie = cookieJar;
    return config;
});

session.interceptors.response.use(res => {
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
        for (const cookie of setCookie) {
            const [name, value] = cookie.split(';')[0].split('=');
            if (cookieJar.includes(`${name}=`)) {
                cookieJar = cookieJar.replace(new RegExp(`${name}=[^;]+;?`), '');
            }
            cookieJar += `${name}=${value}; `;
        }
    }
    return res;
});

// ======================
// LẤY CSRF TOKEN
// ======================
function getCsrfToken(html) {
    const match = html.match(/<meta\s+name="csrf-token"\s+content="([^"]+)"/);
    return match ? match[1] : null;
}

// ======================
// ĐĂNG NHẬP
// ======================
async function login() {
    try {
        const getResp = await session.get(LOGIN_URL);
        const token = getCsrfToken(getResp.data);
        
        const formData = new URLSearchParams();
        formData.append('username', USERNAME);
        formData.append('password', PASSWORD);
        formData.append('_token', token);
        formData.append('action', 'Login');
        
        const headers = {
            'Referer': LOGIN_URL,
            'Origin': BASE,
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        
        const loginResp = await session.post(LOGIN_URL, formData.toString(), { headers });
        return loginResp.status === 200;
    } catch (error) {
        console.error('Login error:', error.message);
        return false;
    }
}

// ======================
// VÀO LOBBY
// ======================
async function goToLobby() {
    try {
        await session.get(LOBBY_URL);
        return true;
    } catch (error) {
        console.error('Lobby error:', error.message);
        return false;
    }
}

// ======================
// LẤY KẾT QUẢ BACCARAT
// ======================
async function fetchBaccaratData() {
    try {
        let xsrfToken = '';
        const xsrfMatch = cookieJar.match(/XSRF-TOKEN=([^;]+)/);
        if (xsrfMatch) xsrfToken = decodeURIComponent(xsrfMatch[1]);
        
        const headers = {
            'Referer': LOBBY_URL,
            'Origin': BASE,
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': xsrfToken,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        };
        
        const formData = new URLSearchParams();
        formData.append('gameCode', 'ae');
        
        const resp = await session.post(GETNEWRESULT_URL, formData.toString(), { headers });
        
        if (resp.data && resp.data.data) {
            baccaratData = resp.data.data.map(item => ({
                table: item.table_name,
                result: item.result,
                shoeId: item.shoeId || '',
                round: item.round || ''
            }));
            lastUpdate = new Date().toISOString();
        }
        
        return baccaratData;
    } catch (error) {
        console.error('Fetch error:', error.message);
        return [];
    }
}

// ==================== UTILS ====================
class Utils {
  static saveData(filename, data) {
    fs.writeFileSync(path.join(__dirname, filename), JSON.stringify(data, null, 2));
  }
  static loadData(filename) {
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, filename), 'utf8'));
    } catch {
      return null;
    }
  }
  static entropy(history) {
    const counts = { B: 0, P: 0 };
    history.forEach(r => counts[r]++);
    const total = history.length;
    let ent = 0;
    Object.values(counts).forEach(c => {
      if (c > 0) {
        const p = c / total;
        ent -= p * Math.log2(p);
      }
    });
    return ent;
  }
  static zScore(history) {
    const n = history.length;
    const b = history.filter(x => x === 'B').length;
    const expected = n / 2;
    const std = Math.sqrt(n * 0.25);
    return (b - expected) / std;
  }
  static movingAverage(history, window = 10) {
    const result = [];
    for (let i = 0; i <= history.length - window; i++) {
      const slice = history.slice(i, i + window);
      const b = slice.filter(x => x === 'B').length;
      result.push(b / window);
    }
    return result;
  }
  static standardDeviation(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
    return Math.sqrt(variance);
  }
  static correlation(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
    const sumX2 = x.reduce((a, b) => a + b * b, 0);
    const sumY2 = y.reduce((a, b) => a + b * b, 0);
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    return denominator === 0 ? 0 : numerator / denominator;
  }
}

// ==================== BASE ANALYZER ====================
class BaccaratBridgeAnalyzer {
  constructor(history = []) {
    this.history = history.filter(r => r === 'B' || r === 'P');
  }
  addResult(r) {
    if (r === 'B' || r === 'P') this.history.push(r);
  }
  detectCurrentBridge() {
    if (this.history.length < 3) return { type: 'không-xác-định', length: 0, side: null, confidence: 0 };
    let currentSide = this.history[this.history.length - 1];
    let length = 1;
    for (let i = this.history.length - 2; i >= 0; i--) {
      if (this.history[i] === currentSide) length++;
      else break;
    }
    const type = length >= 3 ? 'bệt' : (length === 2 ? 'kép' : 'so-le');
    return { type, length, side: currentSide, confidence: Math.min(1, length / 6) };
  }
  getRecentHistory(n = 30) { return this.history.slice(-n); }
  detectPatterns() {
    const h = this.history;
    const patterns = {};
    for (let i = 0; i < h.length - 1; i++) {
      const key = h[i] + h[i+1];
      patterns[key] = (patterns[key] || 0) + 1;
    }
    return patterns;
  }
  detectStreaks() {
    const h = this.history;
    const streaks = { B: [], P: [] };
    if (h.length === 0) return streaks;
    let current = h[0], count = 1;
    for (let i = 1; i < h.length; i++) {
      if (h[i] === current) count++;
      else {
        streaks[current].push(count);
        current = h[i];
        count = 1;
      }
    }
    streaks[current].push(count);
    return streaks;
  }
  detectRuns() {
    const h = this.history;
    const runs = [];
    if (h.length === 0) return runs;
    let current = h[0], count = 1;
    for (let i = 1; i < h.length; i++) {
      if (h[i] === current) count++;
      else {
        runs.push({ side: current, length: count });
        current = h[i];
        count = 1;
      }
    }
    runs.push({ side: current, length: count });
    return runs;
  }
}

// ==================== AI MODULES ====================
class ChatGPTModule {
  predict(history) {
    if (history.length < 3) return { decision: 'B', confidence: 0.52, reason: 'ChatGPT: default' };
    const weights = history.map((_, i) => Math.pow(0.95, history.length - 1 - i));
    let probB = 0, totalW = 0;
    history.forEach((v, i) => {
      const w = weights[i];
      if (v === 'B') probB += w;
      totalW += w;
    });
    probB /= totalW;
    const lastStreak = this.getStreak(history);
    if (lastStreak.length >= 2) probB = lastStreak.side === 'B' ? probB * 1.25 : probB * 0.75;
    const ent = Utils.entropy(history);
    if (ent < 0.5) probB = probB > 0.5 ? probB * 1.1 : probB * 0.9;
    const decision = probB > 0.5 ? 'B' : 'P';
    return { decision, confidence: Math.min(0.92, Math.abs(probB - 0.5) * 2.2), reason: `ChatGPT weighted probB=${probB.toFixed(3)}` };
  }
  getStreak(h) {
    let side = h[h.length-1], len = 1;
    for (let i = h.length-2; i>=0; i--) {
      if (h[i] === side) len++; else break;
    }
    return { side, length: len };
  }
}

class DeepSeekModule {
  constructor() { 
    this.markov = new Map();
    this.order = 4;
  }
  train(history) {
    this.markov.clear();
    for (let i = 0; i < history.length - this.order; i++) {
      const state = history.slice(i, i + this.order).join('');
      const next = history[i + this.order];
      if (!this.markov.has(state)) this.markov.set(state, {B:0, P:0});
      this.markov.get(state)[next]++;
    }
  }
  predict(history) {
    if (history.length < this.order) return { decision: 'B', confidence: 0.5 };
    this.train(history);
    const lastN = history.slice(-this.order).join('');
    const state = this.markov.get(lastN);
    if (!state || state.B + state.P === 0) {
      const fallback = new DeepSeekModule();
      fallback.order = this.order - 1;
      return fallback.predict(history);
    }
    const probB = state.B / (state.B + state.P);
    const ent = Utils.entropy(history);
    const adjusted = probB + (0.5 - probB) * (ent / 3);
    return { 
      decision: adjusted > 0.5 ? 'B' : 'P', 
      confidence: Math.min(0.93, Math.abs(adjusted-0.5)*2.4), 
      reason: `DeepSeek order-${this.order} ${lastN}`
    };
  }
}

class GrokModule {
  predict(history) {
    if (history.length < 8) return { decision: 'B', confidence: 0.5 };
    const numeric = history.map(r => r === 'B' ? 1 : 0);
    let bestCorr = 0, bestP = 2;
    for (let p = 2; p <= 15; p++) {
      let corr = 0, count = 0;
      for (let i = 0; i < numeric.length - p; i++) {
        if (numeric[i] === numeric[i+p]) corr++;
        count++;
      }
      const score = corr / count;
      if (score > bestCorr) { bestCorr = score; bestP = p; }
    }
    const decision = history[history.length - bestP] || 'B';
    const ent = Utils.entropy(history);
    const conf = Math.min(0.94, bestCorr * 1.8 * (1 - ent/3));
    return { decision, confidence: conf, reason: `Grok period=${bestP} corr=${bestCorr.toFixed(3)} ent=${ent.toFixed(2)}` };
  }
}

class GeminiModule {
  predict(history) {
    if (history.length < 5) return { decision: 'B', confidence: 0.5 };
    const freq = { B: 0, P: 0 };
    history.forEach(r => freq[r]++);
    const probB = freq.B / history.length;
    const recent = history.slice(-10);
    const recentB = recent.filter(x => x === 'B').length / recent.length;
    const weighted = probB * 0.4 + recentB * 0.6;
    const decision = weighted > 0.5 ? 'B' : 'P';
    const confidence = Math.min(0.9, Math.abs(weighted - 0.5) * 2.5);
    return { decision, confidence, reason: `Gemini freq=${probB.toFixed(3)} recent=${recentB.toFixed(3)}` };
  }
}

class ClaudeModule {
  predict(history) {
    const analyzer = new BaccaratBridgeAnalyzer(history);
    const bridge = analyzer.detectCurrentBridge();
    const patterns = analyzer.detectPatterns();
    const streaks = analyzer.detectStreaks();
    
    if (bridge.confidence > 0.4) {
      if (bridge.length >= 5) {
        return { decision: bridge.side === 'B' ? 'P' : 'B', confidence: 0.82, reason: `Claude break long ${bridge.type}` };
      }
      return { decision: bridge.side, confidence: 0.88, reason: `Claude follow ${bridge.type}` };
    }
    
    const last2 = history.slice(-2).join('');
    if (patterns[last2] && patterns[last2] > 2) {
      const next = last2 === 'BB' ? 'P' : (last2 === 'PP' ? 'B' : last2);
      return { decision: next, confidence: 0.7, reason: `Claude pattern ${last2}` };
    }
    
    const lastStreak = streaks[history[history.length-1]];
    if (lastStreak && lastStreak.length > 0) {
      const avg = lastStreak.reduce((a,b) => a+b, 0) / lastStreak.length;
      if (lastStreak[lastStreak.length-1] > avg * 0.8) {
        return { decision: history[history.length-1] === 'B' ? 'P' : 'B', confidence: 0.65, reason: 'Claude streak reversal' };
      }
    }
    
    return { decision: 'B', confidence: 0.55, reason: 'Claude default' };
  }
}

class CopilotModule {
  constructor() {
    this.population = [];
    this.generations = 100;
    this.popSize = 50;
  }
  
  evolve(history) {
    this.population = [];
    for (let i = 0; i < this.popSize; i++) {
      this.population.push({
        weights: Array(10).fill(0).map(() => Math.random() * 2 - 1),
        fitness: 0
      });
    }
    
    for (let gen = 0; gen < this.generations; gen++) {
      this.population.forEach(ind => {
        ind.fitness = this.calculateFitness(ind.weights, history);
      });
      this.population.sort((a, b) => b.fitness - a.fitness);
      const newPop = this.population.slice(0, this.popSize * 0.2);
      while (newPop.length < this.popSize) {
        const p1 = this.population[Math.floor(Math.random() * this.popSize * 0.4)];
        const p2 = this.population[Math.floor(Math.random() * this.popSize * 0.4)];
        const child = this.crossover(p1.weights, p2.weights);
        this.mutate(child);
        newPop.push({ weights: child, fitness: 0 });
      }
      this.population = newPop;
    }
    return this.population[0].weights;
  }
  
  calculateFitness(weights, history) {
    let score = 0;
    for (let i = 10; i < history.length; i++) {
      const pred = this.predictWithWeights(history.slice(0, i), weights);
      if (pred === history[i]) score++;
    }
    return score / (history.length - 10);
  }
  
  predictWithWeights(history, weights) {
    let score = 0;
    for (let i = 0; i < Math.min(10, history.length); i++) {
      const val = history[history.length - 1 - i] === 'B' ? 1 : -1;
      score += val * weights[i];
    }
    return score > 0 ? 'B' : 'P';
  }
  
  crossover(w1, w2) {
    const point = Math.floor(Math.random() * w1.length);
    return [...w1.slice(0, point), ...w2.slice(point)];
  }
  
  mutate(w) {
    for (let i = 0; i < w.length; i++) {
      if (Math.random() < 0.1) {
        w[i] += (Math.random() - 0.5) * 0.5;
      }
    }
  }
  
  predict(history) {
    if (history.length < 10) return { decision: 'B', confidence: 0.5 };
    const weights = this.evolve(history);
    const result = this.predictWithWeights(history, weights);
    const confidence = Math.min(0.9, 0.5 + Math.random() * 0.4);
    return { decision: result, confidence, reason: 'Copilot GA optimized' };
  }
}

class XAIModule {
  predict(history) {
    const recent = history.slice(-15);
    const bCount = recent.filter(x => x==='B').length;
    const zScore = Utils.zScore(history);
    const ent = Utils.entropy(history);
    let decision = bCount > 8 ? 'B' : 'P';
    let confidence = 0.75 + Math.random()*0.15;
    if (Math.abs(zScore) > 2) {
      decision = zScore > 0 ? 'P' : 'B';
      confidence = 0.85;
    }
    if (ent < 0.3) {
      decision = history[history.length-1] === 'B' ? 'P' : 'B';
      confidence = 0.78;
    }
    return { 
      decision, 
      confidence: Math.min(0.95, confidence), 
      reason: `xAI truth-max z=${zScore.toFixed(2)} ent=${ent.toFixed(2)}` 
    };
  }
}

class RLModule {
  constructor() {
    this.qTable = new Map();
    this.alpha = 0.1;
    this.gamma = 0.9;
    this.epsilon = 0.3;
  }
  
  getState(history) {
    if (history.length < 4) return 'default';
    const last4 = history.slice(-4).join('');
    return last4;
  }
  
  getAction(state) {
    if (!this.qTable.has(state)) {
      this.qTable.set(state, { B: 0, P: 0 });
    }
    if (Math.random() < this.epsilon) {
      return Math.random() > 0.5 ? 'B' : 'P';
    }
    const q = this.qTable.get(state);
    return q.B > q.P ? 'B' : 'P';
  }
  
  update(state, action, reward, nextState) {
    if (!this.qTable.has(state)) {
      this.qTable.set(state, { B: 0, P: 0 });
    }
    if (!this.qTable.has(nextState)) {
      this.qTable.set(nextState, { B: 0, P: 0 });
    }
    const q = this.qTable.get(state);
    const nextQ = this.qTable.get(nextState);
    const maxNext = Math.max(nextQ.B, nextQ.P);
    q[action] += this.alpha * (reward + this.gamma * maxNext - q[action]);
  }
  
  predict(history) {
    const state = this.getState(history);
    const action = this.getAction(state);
    const confidence = 0.6 + Math.random() * 0.3;
    return { decision: action, confidence, reason: `RL state=${state}` };
  }
}

// ==================== PREDICTOR CLASS ====================
class BaccaratPredictor {
    constructor(tsKhangBridge) {
        this.bridge = tsKhangBridge;
        this.predictionHistory = [];
        this.confidenceThreshold = 0.65;
        this.minHistoryLength = 10;
        this.maxPredictionAge = 5000;
        this.lastPrediction = null;
        this.lastPredictionTime = 0;
    }

    predict(history = null) {
        const hist = history || this.bridge.history;
        if (hist.length < this.minHistoryLength) {
            return {
                success: false,
                message: `Cần ít nhất ${this.minHistoryLength} kết quả`,
                prediction: 'B',
                confidence: 0.5
            };
        }

        const result = this.bridge.predictCurrent();
        return {
            success: true,
            prediction: result.finalDecision,
            confidence: result.confidence,
            bridge: result.bridge,
            entropy: result.entropy,
            zScore: result.zScore,
            vote: result.vote,
            mc: result.mc,
            details: result.details,
            timestamp: new Date().toISOString()
        };
    }

    predictSequence(length = 5, history = null) {
        const hist = history || this.bridge.history;
        if (hist.length < this.minHistoryLength) {
            return { success: false, message: 'Không đủ dữ liệu' };
        }

        const predictions = [];
        let currentHist = [...hist];

        for (let i = 0; i < length; i++) {
            const tempBridge = new TsKhangBridge(currentHist);
            const pred = tempBridge.predictCurrent();
            
            predictions.push({
                step: i + 1,
                prediction: pred.finalDecision,
                confidence: pred.confidence,
                entropy: pred.entropy,
                bridge: pred.bridge
            });

            currentHist.push(pred.finalDecision);
        }

        return {
            success: true,
            sequence: predictions,
            confidence: predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length,
            timestamp: new Date().toISOString()
        };
    }

    predictWithStrategy(history = null) {
        const hist = history || this.bridge.history;
        if (hist.length < this.minHistoryLength) {
            return { success: false, message: 'Không đủ dữ liệu' };
        }

        const basePred = this.predict(hist);
        if (!basePred.success) return basePred;

        const analyzer = new BaccaratBridgeAnalyzer(hist);
        const bridge = analyzer.detectCurrentBridge();
        const patterns = analyzer.detectPatterns();
        const streaks = analyzer.detectStreaks();

        let strategy = 'default';
        let adjustedConfidence = basePred.confidence;

        if (bridge.type === 'bệt' && bridge.length >= 4) {
            const reverse = bridge.side === 'B' ? 'P' : 'B';
            strategy = 'reverse_bridge';
            adjustedConfidence = Math.min(0.85, basePred.confidence * 0.9);
            return {
                success: true,
                prediction: reverse,
                confidence: adjustedConfidence,
                strategy: strategy,
                bridge: bridge,
                basePrediction: basePred,
                patterns: patterns,
                streaks: streaks,
                timestamp: new Date().toISOString()
            };
        }

        if (bridge.type === 'so-le' && bridge.length >= 2) {
            strategy = 'continue_bridge';
            adjustedConfidence = Math.min(0.88, basePred.confidence * 1.1);
            return {
                success: true,
                prediction: bridge.side || basePred.prediction,
                confidence: adjustedConfidence,
                strategy: strategy,
                bridge: bridge,
                basePrediction: basePred,
                patterns: patterns,
                streaks: streaks,
                timestamp: new Date().toISOString()
            };
        }

        const last2 = hist.slice(-2).join('');
        if (patterns[last2] && patterns[last2] > 3) {
            const next = last2 === 'BB' ? 'P' : (last2 === 'PP' ? 'B' : last2);
            strategy = 'pattern_follow';
            adjustedConfidence = Math.min(0.82, 0.7 + patterns[last2] * 0.02);
            return {
                success: true,
                prediction: next,
                confidence: adjustedConfidence,
                strategy: strategy,
                pattern: last2,
                patternCount: patterns[last2],
                basePrediction: basePred,
                timestamp: new Date().toISOString()
            };
        }

        return {
            success: true,
            prediction: basePred.prediction,
            confidence: basePred.confidence,
            strategy: 'ensemble_default',
            basePrediction: basePred,
            patterns: patterns,
            streaks: streaks,
            timestamp: new Date().toISOString()
        };
    }

    predictWithRisk(history = null, riskLevel = 'medium') {
        const hist = history || this.bridge.history;
        const pred = this.predictWithStrategy(hist);
        if (!pred.success) return pred;

        const riskFactors = {
            low: 0.9,
            medium: 1.0,
            high: 1.1
        };
        const factor = riskFactors[riskLevel] || 1.0;
        pred.confidence = Math.min(0.95, pred.confidence * factor);

        const stake = pred.confidence > 0.8 ? 2 : (pred.confidence > 0.65 ? 1 : 0.5);
        pred.stake = stake;
        pred.riskLevel = riskLevel;
        pred.recommendation = stake >= 1 ? 'TĂNG CƯỜNG' : 'THẬN TRỌNG';

        const stats = this.bridge.getStats();
        const winRate = parseFloat(stats.winRate) || 0;
        const maxStreak = Math.max(
            ...Object.values(this.bridge.getStreaks()).flat(),
            0
        );

        pred.bankroll = {
            winRate: winRate,
            maxStreak: maxStreak,
            volatility: Math.abs(pred.zScore || 0) > 2 ? 'CAO' : 'THẤP',
            confidenceLevel: pred.confidence > 0.7 ? 'CAO' : 'TRUNG BÌNH'
        };

        return pred;
    }

    getRealTimePrediction() {
        const now = Date.now();
        
        if (this.lastPrediction && (now - this.lastPredictionTime) < this.maxPredictionAge) {
            return this.lastPrediction;
        }

        const pred = this.predictWithRisk(null, 'medium');
        this.lastPrediction = pred;
        this.lastPredictionTime = now;
        this.predictionHistory.push(pred);
        
        if (this.predictionHistory.length > 100) {
            this.predictionHistory.shift();
        }

        return pred;
    }

    evaluateAccuracy(history = null) {
        const hist = history || this.bridge.history;
        if (hist.length < 20) {
            return { success: false, message: 'Cần ít nhất 20 kết quả để đánh giá' };
        }

        let correct = 0;
        let total = 0;
        const results = [];

        for (let i = 20; i < hist.length; i++) {
            const train = hist.slice(0, i);
            const actual = hist[i];
            
            const tempBridge = new TsKhangBridge(train);
            const pred = tempBridge.predictCurrent();
            
            const isCorrect = pred.finalDecision === actual;
            if (isCorrect) correct++;
            total++;
            
            results.push({
                index: i,
                actual: actual,
                predicted: pred.finalDecision,
                confidence: pred.confidence,
                isCorrect: isCorrect,
                bridge: pred.bridge.type
            });
        }

        const accuracy = total > 0 ? correct / total : 0;
        
        const byBridge = {};
        results.forEach(r => {
            if (!byBridge[r.bridge]) {
                byBridge[r.bridge] = { correct: 0, total: 0 };
            }
            byBridge[r.bridge].total++;
            if (r.isCorrect) byBridge[r.bridge].correct++;
        });

        Object.keys(byBridge).forEach(key => {
            byBridge[key].accuracy = byBridge[key].correct / byBridge[key].total;
        });

        return {
            success: true,
            total: total,
            correct: correct,
            accuracy: (accuracy * 100).toFixed(2) + '%',
            byBridge: byBridge,
            details: results.slice(-30),
            timestamp: new Date().toISOString()
        };
    }

    findPatterns(history = null, windowSize = 5) {
        const hist = history || this.bridge.history;
        if (hist.length < windowSize + 1) {
            return { success: false, message: 'Không đủ dữ liệu' };
        }

        const patterns = {};
        
        for (let i = 0; i < hist.length - windowSize; i++) {
            const pattern = hist.slice(i, i + windowSize).join('');
            const next = hist[i + windowSize];
            
            if (!patterns[pattern]) {
                patterns[pattern] = { B: 0, P: 0 };
            }
            patterns[pattern][next]++;
        }

        const currentPattern = hist.slice(-windowSize).join('');
        const currentStats = patterns[currentPattern] || { B: 0, P: 0 };
        const total = currentStats.B + currentStats.P;

        let prediction = 'B';
        let confidence = 0.5;
        if (total > 0) {
            const bProb = currentStats.B / total;
            prediction = bProb > 0.5 ? 'B' : 'P';
            confidence = Math.abs(bProb - 0.5) * 2;
            confidence = Math.min(0.9, Math.max(0.5, confidence));
        }

        return {
            success: true,
            currentPattern: currentPattern,
            patternStats: currentStats,
            totalMatches: total,
            prediction: prediction,
            confidence: confidence,
            allPatterns: patterns,
            timestamp: new Date().toISOString()
        };
    }

    predictWithProbability(history = null) {
        const hist = history || this.bridge.history;
        if (hist.length < this.minHistoryLength) {
            return { success: false, message: 'Không đủ dữ liệu' };
        }

        const bCount = hist.filter(x => x === 'B').length;
        const pCount = hist.length - bCount;
        const baseProbB = bCount / hist.length;

        const condProb = this.calculateConditionalProbabilities(hist);

        const analyzer = new BaccaratBridgeAnalyzer(hist);
        const bridge = analyzer.detectCurrentBridge();
        const entropy = Utils.entropy(hist);
        const zScore = Utils.zScore(hist);

        let adjustedProbB = baseProbB;

        if (bridge.type === 'bệt') {
            adjustedProbB = bridge.side === 'B' ? adjustedProbB * 1.2 : adjustedProbB * 0.8;
        }

        if (entropy < 0.5) {
            adjustedProbB = adjustedProbB > 0.5 ? adjustedProbB * 1.15 : adjustedProbB * 0.85;
        }

        if (Math.abs(zScore) > 2) {
            adjustedProbB = zScore > 0 ? adjustedProbB * 0.9 : adjustedProbB * 1.1;
        }

        if (condProb && condProb.nextProb) {
            adjustedProbB = adjustedProbB * 0.3 + condProb.nextProb.B * 0.7;
        }

        adjustedProbB = Math.max(0.1, Math.min(0.9, adjustedProbB));

        const prediction = adjustedProbB > 0.5 ? 'B' : 'P';
        const confidence = Math.abs(adjustedProbB - 0.5) * 2;

        return {
            success: true,
            prediction: prediction,
            probability: {
                B: adjustedProbB,
                P: 1 - adjustedProbB
            },
            confidence: Math.min(0.95, confidence),
            baseProbability: baseProbB,
            bridge: bridge,
            entropy: entropy,
            zScore: zScore,
            conditionalProb: condProb,
            timestamp: new Date().toISOString()
        };
    }

    calculateConditionalProbabilities(history) {
        if (history.length < 3) return null;

        const last1 = history.slice(-1);
        const last2 = history.slice(-2);
        const last3 = history.slice(-3);

        const result = {
            last1: last1[0],
            last2: last2.join(''),
            last3: last3.join(''),
            nextProb: { B: 0, P: 0 }
        };

        let bCount = 0, pCount = 0;
        let matches = 0;

        for (let i = 0; i < history.length - 3; i++) {
            if (history[i] === last1[0] && 
                history[i + 1] === last2[1] &&
                history[i + 2] === last3[2]) {
                matches++;
                const next = history[i + 3];
                if (next === 'B') bCount++;
                else if (next === 'P') pCount++;
            }
        }

        if (matches > 0) {
            result.nextProb.B = bCount / matches;
            result.nextProb.P = pCount / matches;
            result.matches = matches;
        }

        return result;
    }
}

// ==================== META ENSEMBLE ULTRA ====================
class MultiAIEnsembleUltra {
  constructor() {
    this.modules = {
      ChatGPT: new ChatGPTModule(),
      DeepSeek: new DeepSeekModule(),
      Grok: new GrokModule(),
      Gemini: new GeminiModule(),
      Claude: new ClaudeModule(),
      Copilot: new CopilotModule(),
      xAI: new XAIModule(),
      RL: new RLModule()
    };
    this.weights = {};
    Object.keys(this.modules).forEach(k => this.weights[k] = 1.0);
    this.performanceLog = [];
    this.loadState();
  }

  predict(history) {
    let bVote = 0, pVote = 0, totalW = 0;
    const preds = {};
    const details = [];
    
    Object.entries(this.modules).forEach(([name, mod]) => {
      const pred = mod.predict(history);
      preds[name] = pred;
      const w = this.weights[name] || 1;
      if (pred.decision === 'B') bVote += w * pred.confidence;
      else pVote += w * pred.confidence;
      totalW += w;
      details.push(`[${name}] → ${pred.decision} (${pred.confidence.toFixed(3)}) | ${pred.reason}`);
    });

    const finalDecision = bVote > pVote ? 'B' : 'P';
    const confidence = Math.min(0.97, Math.abs(bVote - pVote) / totalW * 1.8);

    const mc = this.monteCarloSim(history, 100);
    const analyzer = new BaccaratBridgeAnalyzer(history);
    const bridge = analyzer.detectCurrentBridge();
    const entropy = Utils.entropy(history);
    const zScore = Utils.zScore(history);

    return { 
      finalDecision, 
      confidence, 
      predictions: preds, 
      vote: {B: bVote, P: pVote}, 
      mc,
      bridge,
      entropy,
      zScore,
      details
    };
  }

  monteCarloSim(history, runs = 100) {
    let bWins = 0;
    const probB = history.filter(x => x === 'B').length / history.length || 0.5;
    for (let i = 0; i < runs; i++) {
      let simHist = [...history];
      for (let j = 0; j < 12; j++) {
        const p = probB + (Math.random() - 0.5) * 0.2;
        simHist.push(Math.random() < p ? 'B' : 'P');
      }
      const last = simHist[simHist.length-1];
      if (last === 'B') bWins++;
    }
    return { bProb: bWins / runs, runs };
  }

  updateWeights(actual, historyBefore) {
    const results = {};
    Object.entries(this.modules).forEach(([name, mod]) => {
      const pred = mod.predict(historyBefore);
      const correct = pred.decision === actual;
      results[name] = correct;
      const delta = correct ? 0.12 : -0.09;
      const confFactor = pred.confidence - 0.5;
      const adjustedDelta = delta * (1 + confFactor);
      this.weights[name] = Math.max(0.1, Math.min(5.0, (this.weights[name] || 1) + adjustedDelta));
    });
    this.performanceLog.push({ actual, ...results, timestamp: new Date().toISOString() });
    if (this.performanceLog.length > 1000) this.performanceLog.shift();
    this.saveState();
  }

  loadState() {
    const saved = Utils.loadData('ensemble_state_v3.json');
    if (saved) {
      this.weights = saved.weights || {};
      this.performanceLog = saved.performanceLog || [];
      console.log('[Ensemble] Loaded state');
    }
  }

  saveState() {
    Utils.saveData('ensemble_state_v3.json', { 
      weights: this.weights, 
      performanceLog: this.performanceLog.slice(-500) 
    });
  }
}

// ==================== TS KHANG BRIDGE ====================
class TsKhangBridge {
  constructor(history = []) {
    this.history = history.filter(r => r === 'B' || r === 'P');
    this.analyzer = new BaccaratBridgeAnalyzer(this.history);
    this.ensemble = new MultiAIEnsembleUltra();
    this.eventBus = new EventEmitter();
    this.logFile = path.join(__dirname, 'predict_log_v3.csv');
    this.initLog();
    this.loadState();
  }

  initLog() {
    if (!fs.existsSync(this.logFile)) {
      fs.writeFileSync(this.logFile, 'timestamp,actual,predicted,confidence,win,bridge_type,entropy\n');
    }
  }

  addResultAndTrain(actual) {
    if (actual !== 'B' && actual !== 'P') return;
    const historyBefore = [...this.history];
    this.history.push(actual);
    this.analyzer.addResult(actual);
    this.ensemble.updateWeights(actual, historyBefore);
    const lastPred = this.ensemble.predict(historyBefore);
    const win = (lastPred.finalDecision === actual) ? 1 : 0;
    const bridge = this.analyzer.detectCurrentBridge();
    const ent = Utils.entropy(this.history);
    const logLine = `${new Date().toISOString()},${actual},${lastPred.finalDecision},${lastPred.confidence.toFixed(4)},${win},${bridge.type},${ent.toFixed(4)}\n`;
    fs.appendFileSync(this.logFile, logLine);
    this.eventBus.emit('newResult', { actual, predicted: lastPred, win, bridge, entropy: ent });
    this.saveState();
  }

  predictCurrent() {
    return this.ensemble.predict(this.history);
  }

  getBridgeInfo() {
    return this.analyzer.detectCurrentBridge();
  }

  getPatterns() {
    return this.analyzer.detectPatterns();
  }

  getStreaks() {
    return this.analyzer.detectStreaks();
  }

  getRuns() {
    return this.analyzer.detectRuns();
  }

  getStats() {
    const total = this.history.length;
    if (total === 0) return { total: 0, B: 0, P: 0, last10: [], winRate: 0 };
    const b = this.history.filter(x => x === 'B').length;
    const p = total - b;
    const last10 = this.history.slice(-10);
    let winRate = 0;
    try {
      const logData = fs.readFileSync(this.logFile, 'utf8').split('\n').slice(1);
      const wins = logData.filter(line => line.includes(',1,')).length;
      const totalLogs = logData.filter(line => line.trim().length > 0).length;
      winRate = totalLogs > 0 ? wins / totalLogs : 0;
    } catch(e) {}
    return { total, B: b, P: p, ratio: (b/total).toFixed(3), last10, winRate: winRate.toFixed(4), entropy: Utils.entropy(this.history), zScore: Utils.zScore(this.history) };
  }

  saveState() {
    Utils.saveData('tskhang_state_v3.json', { history: this.history, weights: this.ensemble.weights, performanceLog: this.ensemble.performanceLog.slice(-500), timestamp: new Date().toISOString() });
  }

  loadState() {
    const saved = Utils.loadData('tskhang_state_v3.json');
    if (saved && saved.history) {
      this.history = saved.history.filter(r => r === 'B' || r === 'P');
      if (saved.weights) {
        Object.keys(saved.weights).forEach(k => {
          if (this.ensemble.weights[k] !== undefined) {
            this.ensemble.weights[k] = saved.weights[k];
          }
        });
      }
      if (saved.performanceLog) this.ensemble.performanceLog = saved.performanceLog;
      console.log(`[TS Khang] Loaded ${this.history.length} samples`);
    }
  }

  backtest() {
    const hist = this.history;
    if (hist.length < 20) return { success: false, message: 'Need at least 20 samples' };
    let correct = 0;
    const results = [];
    const tempEnsemble = new MultiAIEnsembleUltra();
    for (let i = 20; i < hist.length; i++) {
      const train = hist.slice(0, i);
      const actual = hist[i];
      tempEnsemble.weights = { ...this.ensemble.weights };
      const pred = tempEnsemble.predict(train);
      const win = (pred.finalDecision === actual) ? 1 : 0;
      correct += win;
      results.push({ index: i, actual, predicted: pred.finalDecision, confidence: pred.confidence, win, bridge: pred.bridge.type, entropy: pred.entropy });
    }
    const accuracy = correct / results.length;
    const wins = results.filter(r => r.win === 1).length;
    const losses = results.length - wins;
    return { success: true, total: results.length, correct, accuracy: accuracy.toFixed(4), wins, losses, profit: wins - losses, winRate: (wins / results.length * 100).toFixed(2) + '%', details: results.slice(-50) };
  }
}

// ==================== TABLE PREDICTOR CLASS ====================
class TablePredictor {
    constructor() {
        this.tableHistory = {};
        this.tablePredictors = {};
        this.tableBridges = {};
    }

    updateTableHistoryFromBaccaratData() {
        if (!baccaratData || baccaratData.length === 0) {
            console.log('[TablePredictor] Chưa có dữ liệu baccaratData');
            return;
        }

        let updated = 0;
        baccaratData.forEach(item => {
            if (item.table && item.result) {
                const resultChar = item.result.trim().toUpperCase();
                if (resultChar === 'B' || resultChar === 'P') {
                    if (!this.tableHistory[item.table]) {
                        this.tableHistory[item.table] = [];
                    }
                    const hist = this.tableHistory[item.table];
                    const lastResult = hist.length > 0 ? hist[hist.length - 1] : null;
                    
                    if (lastResult !== resultChar) {
                        hist.push(resultChar);
                        updated++;
                        if (hist.length > 500) {
                            hist.shift();
                        }
                        this.tablePredictors[item.table] = new TsKhangBridge(hist);
                        this.tableBridges[item.table] = new BaccaratBridgeAnalyzer(hist);
                    }
                }
            }
        });
        
        console.log(`[TablePredictor] Đã cập nhật ${updated} kết quả mới cho các bàn`);
        console.log(`[TablePredictor] Tổng số bàn đang theo dõi: ${Object.keys(this.tableHistory).length}`);
    }

    updateTableHistory(tableName, result) {
        if (!this.tableHistory[tableName]) {
            this.tableHistory[tableName] = [];
        }
        const hist = this.tableHistory[tableName];
        const lastResult = hist.length > 0 ? hist[hist.length - 1] : null;
        if (lastResult !== result) {
            hist.push(result);
            if (hist.length > 500) {
                hist.shift();
            }
            this.tablePredictors[tableName] = new TsKhangBridge(hist);
            this.tableBridges[tableName] = new BaccaratBridgeAnalyzer(hist);
        }
        return hist;
    }

    getTableHistory(tableName) {
        return this.tableHistory[tableName] || [];
    }

    predictTable(tableName) {
        const hist = this.getTableHistory(tableName);
        if (hist.length < 3) {
            return {
                success: false,
                message: `Bàn ${tableName} chưa có đủ dữ liệu (cần ít nhất 3 kết quả)`,
                prediction: 'B',
                confidence: 0.5,
                historyLength: hist.length
            };
        }

        if (!this.tablePredictors[tableName]) {
            this.tablePredictors[tableName] = new TsKhangBridge(hist);
        }

        const pred = this.tablePredictors[tableName].predictCurrent();
        const bridge = this.tableBridges[tableName]?.detectCurrentBridge() || { type: 'không-xác-định', length: 0, side: null };
        const stats = this.tablePredictors[tableName].getStats();

        return {
            success: true,
            table: tableName,
            prediction: pred.finalDecision,
            confidence: pred.confidence,
            bridge: bridge,
            stats: stats,
            vote: pred.vote,
            mc: pred.mc,
            entropy: pred.entropy,
            zScore: pred.zScore,
            historyLength: hist.length,
            timestamp: new Date().toISOString()
        };
    }

    predictAllTables() {
        const tables = Object.keys(this.tableHistory);
        const results = {};
        tables.forEach(table => {
            results[table] = this.predictTable(table);
        });
        return results;
    }

    addResultAndTrain(tableName, result) {
        if (result !== 'B' && result !== 'P') return { success: false, message: 'Kết quả phải là B hoặc P' };
        
        const hist = this.updateTableHistory(tableName, result);
        if (this.tablePredictors[tableName]) {
            this.tablePredictors[tableName].addResultAndTrain(result);
        } else {
            this.tablePredictors[tableName] = new TsKhangBridge(hist);
        }
        return { success: true, table: tableName, result: result, historyLength: hist.length };
    }

    resetTable(tableName) {
        this.tableHistory[tableName] = [];
        this.tablePredictors[tableName] = null;
        this.tableBridges[tableName] = null;
        return { success: true, message: `Đã reset bàn ${tableName}` };
    }

    resetAll() {
        this.tableHistory = {};
        this.tablePredictors = {};
        this.tableBridges = {};
        return { success: true, message: 'Đã reset tất cả bàn' };
    }
}

// ==================== HÀM DỰ ĐOÁN ĐỘC LẬP ====================
function predictBaccarat(history, options = {}) {
    const defaultOptions = {
        method: 'advanced',
        riskLevel: 'medium',
        sequenceLength: 5,
        windowSize: 5
    };
    
    const config = { ...defaultOptions, ...options };
    
    if (!history || !Array.isArray(history) || history.length === 0) {
        return {
            success: false,
            error: 'Lịch sử không hợp lệ',
            prediction: 'B',
            confidence: 0.5,
            timestamp: new Date().toISOString()
        };
    }
    
    const cleanHistory = history.filter(r => r === 'B' || r === 'P');
    if (cleanHistory.length < 3) {
        return {
            success: false,
            error: `Cần ít nhất 3 kết quả (hiện có ${cleanHistory.length})`,
            prediction: 'B',
            confidence: 0.5,
            timestamp: new Date().toISOString()
        };
    }
    
    const tempBridge = new TsKhangBridge(cleanHistory);
    const predictor = new BaccaratPredictor(tempBridge);
    
    let result;
    
    switch (config.method) {
        case 'basic':
            result = predictor.predict();
            break;
        case 'advanced':
            result = predictor.predictWithStrategy();
            break;
        case 'probability':
            result = predictor.predictWithProbability();
            break;
        case 'strategy':
            result = predictor.predictWithRisk(null, config.riskLevel);
            break;
        case 'sequence':
            result = predictor.predictSequence(config.sequenceLength);
            break;
        case 'pattern':
            result = predictor.findPatterns(null, config.windowSize);
            break;
        default:
            result = predictor.predictWithStrategy();
    }
    
    return {
        ...result,
        method: config.method,
        historyLength: cleanHistory.length,
        timestamp: new Date().toISOString(),
        version: '3.0'
    };
}

function quickPredict(history) {
    if (!history || history.length < 3) {
        return { prediction: 'B', confidence: 0.5 };
    }
    
    const clean = history.filter(r => r === 'B' || r === 'P');
    const analyzer = new BaccaratBridgeAnalyzer(clean);
    const bridge = analyzer.detectCurrentBridge();
    const patterns = analyzer.detectPatterns();
    
    let score = 0;
    const last = clean[clean.length - 1];
    
    if (bridge.type === 'bệt' && bridge.length >= 3) {
        score = bridge.side === 'B' ? -0.3 : 0.3;
    } else if (bridge.type === 'so-le' && bridge.length >= 2) {
        score = bridge.side === 'B' ? 0.4 : -0.4;
    }
    
    const last2 = clean.slice(-2).join('');
    if (patterns[last2] && patterns[last2] > 2) {
        const next = last2 === 'BB' ? -0.2 : (last2 === 'PP' ? 0.2 : 0);
        score += next;
    }
    
    const ent = Utils.entropy(clean);
    if (ent < 0.4) {
        score += (last === 'B' ? -0.15 : 0.15);
    }
    
    const prediction = score > 0 ? 'P' : 'B';
    const confidence = Math.min(0.85, 0.5 + Math.abs(score));
    
    return {
        prediction,
        confidence,
        score,
        bridge: bridge.type,
        entropy: ent
    };
}

function predictByStrategy(history, strategy = 'martingale') {
    const clean = history.filter(r => r === 'B' || r === 'P');
    if (clean.length < 5) {
        return { prediction: 'B', confidence: 0.5, strategy: strategy };
    }
    
    let prediction = 'B';
    let confidence = 0.5;
    const analyzer = new BaccaratBridgeAnalyzer(clean);
    const bridge = analyzer.detectCurrentBridge();
    const patterns = analyzer.detectPatterns();
    
    switch (strategy) {
        case 'martingale':
            if (bridge.type === 'bệt' && bridge.length >= 4) {
                prediction = bridge.side === 'B' ? 'P' : 'B';
                confidence = 0.7 + bridge.length * 0.02;
            } else {
                prediction = bridge.side || 'B';
                confidence = 0.55;
            }
            break;
            
        case 'paroli':
            if (bridge.type === 'so-le') {
                prediction = bridge.side || 'B';
                confidence = 0.65;
            } else if (bridge.type === 'bệt' && bridge.length < 4) {
                prediction = bridge.side || 'B';
                confidence = 0.6;
            } else {
                const bCount = clean.filter(x => x === 'B').length;
                prediction = bCount > clean.length / 2 ? 'B' : 'P';
                confidence = 0.55;
            }
            break;
            
        case 'flat':
            const bFreq = clean.filter(x => x === 'B').length / clean.length;
            prediction = bFreq > 0.5 ? 'B' : 'P';
            confidence = Math.abs(bFreq - 0.5) * 2 + 0.3;
            break;
            
        case 'trend':
            const last3 = clean.slice(-3).join('');
            const trendMap = {
                'BBB': 'P', 'PPP': 'B', 'BBP': 'P', 'PPB': 'B',
                'BPB': 'P', 'PBP': 'B', 'BPP': 'B', 'PBB': 'P'
            };
            prediction = trendMap[last3] || 'B';
            confidence = 0.6;
            if (bridge.type === 'bệt' && bridge.length >= 3) {
                confidence = 0.75;
            }
            break;
            
        default:
            prediction = 'B';
            confidence = 0.5;
    }
    
    return {
        prediction,
        confidence: Math.min(0.92, confidence),
        strategy: strategy,
        bridge: bridge.type,
        timestamp: new Date().toISOString()
    };
}

function comprehensivePredict(history) {
    const clean = history.filter(r => r === 'B' || r === 'P');
    if (clean.length < 10) {
        return {
            prediction: 'B',
            confidence: 0.5,
            methods: {},
            final: 'B',
            timestamp: new Date().toISOString()
        };
    }
    
    const methods = {
        basic: predictBaccarat(clean, { method: 'basic' }),
        strategy: predictBaccarat(clean, { method: 'strategy' }),
        probability: predictBaccarat(clean, { method: 'probability' }),
        pattern: predictBaccarat(clean, { method: 'pattern' }),
        quick: quickPredict(clean)
    };
    
    let bVotes = 0, pVotes = 0;
    let totalConfidence = 0;
    
    Object.entries(methods).forEach(([name, result]) => {
        const pred = result.prediction || result.finalDecision || 'B';
        const conf = result.confidence || 0.5;
        
        if (pred === 'B') {
            bVotes += conf;
        } else {
            pVotes += conf;
        }
        totalConfidence += conf;
    });
    
    const final = bVotes > pVotes ? 'B' : 'P';
    const confidence = Math.abs(bVotes - pVotes) / totalConfidence;
    
    const stats = {
        B: bVotes,
        P: pVotes,
        total: totalConfidence,
        ratio: (bVotes / totalConfidence).toFixed(3)
    };
    
    return {
        prediction: final,
        confidence: Math.min(0.95, confidence),
        methods: methods,
        stats: stats,
        details: {
            bridge: new BaccaratBridgeAnalyzer(clean).detectCurrentBridge(),
            entropy: Utils.entropy(clean),
            zScore: Utils.zScore(clean),
            historyLength: clean.length
        },
        timestamp: new Date().toISOString()
    };
}

// ==================== KHỞI TẠO APP ====================
const app = express();
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', '*');
    next();
});

const tsKhang = new TsKhangBridge();
const predictor = new BaccaratPredictor(tsKhang);
const tablePredictor = new TablePredictor();

// ==================== API ENDPOINTS ====================
app.get('/api/baccarat', (req, res) => {
    res.json({ success: true, data: baccaratData, lastUpdate: lastUpdate, total: baccaratData.length });
});

app.get('/api/baccarat/:table', (req, res) => {
    const found = baccaratData.find(item => item.table === req.params.table);
    found ? res.json({ success: true, data: found }) : res.json({ success: false, message: 'Không tìm thấy bàn ' + req.params.table });
});

app.get('/api/latest', (req, res) => {
    const latest = [...baccaratData].sort((a, b) => (parseInt(a.table) || 0) - (parseInt(b.table) || 0));
    res.json({ success: true, data: latest.slice(0, 10), lastUpdate: lastUpdate });
});

app.get('/api/predict', (req, res) => {
    const bridge = tsKhang.getBridgeInfo();
    const stats = tsKhang.getStats();
    const patterns = tsKhang.getPatterns();
    const streaks = tsKhang.getStreaks();
    const runs = tsKhang.getRuns();
    const pred = tsKhang.predictCurrent();
    res.json({ success: true, prediction: pred.finalDecision, confidence: pred.confidence, bridge, stats, vote: pred.vote, mc: pred.mc, patterns, streaks, runs, entropy: pred.entropy, zScore: pred.zScore, details: pred.details });
});

app.get('/api/predict/advanced', (req, res) => {
    const { strategy, risk, sequence, window } = req.query;
    
    let result;
    
    if (sequence) {
        const len = parseInt(sequence) || 5;
        result = predictor.predictSequence(len);
    } else if (strategy) {
        result = predictor.predictWithStrategy();
    } else if (risk) {
        const riskLevel = risk === 'low' ? 'low' : (risk === 'high' ? 'high' : 'medium');
        result = predictor.predictWithRisk(null, riskLevel);
    } else if (window) {
        const ws = parseInt(window) || 5;
        result = predictor.findPatterns(null, ws);
    } else {
        result = predictor.predict();
    }
    
    res.json(result);
});

app.get('/api/predict/evaluate', (req, res) => {
    const result = predictor.evaluateAccuracy();
    res.json(result);
});

app.get('/api/predict/probability', (req, res) => {
    const result = predictor.predictWithProbability();
    res.json(result);
});

app.get('/api/predict/realtime', (req, res) => {
    const result = predictor.getRealTimePrediction();
    res.json(result);
});

app.get('/api/predict/patterns', (req, res) => {
    const windowSize = parseInt(req.query.window) || 5;
    const result = predictor.findPatterns(null, windowSize);
    res.json(result);
});

app.get('/api/predict/sequence/:length', (req, res) => {
    const length = parseInt(req.params.length) || 5;
    const result = predictor.predictSequence(length);
    res.json(result);
});

// ==================== API DỰ ĐOÁN CHO TỪNG BÀN (ĐÃ SỬA) ====================
app.get('/api/predict/table/:table', (req, res) => {
    const tableName = req.params.table;
    
    console.log(`[API] Dự đoán bàn ${tableName}`);
    
    tablePredictor.updateTableHistoryFromBaccaratData();
    
    const tableData = baccaratData.find(item => item.table === tableName);
    if (tableData && tableData.result) {
        const resultChar = tableData.result.trim().toUpperCase();
        if (resultChar === 'B' || resultChar === 'P') {
            tablePredictor.updateTableHistory(tableName, resultChar);
        }
    }
    
    const history = tablePredictor.getTableHistory(tableName);
    console.log(`[API] Bàn ${tableName} có ${history.length} kết quả`);
    
    if (history.length < 3) {
        let allResults = [];
        baccaratData.forEach(item => {
            if (item.table === tableName && item.result) {
                const r = item.result.trim().toUpperCase();
                if (r === 'B' || r === 'P') {
                    allResults.push(r);
                }
            }
        });
        
        if (allResults.length > 0) {
            allResults.forEach(r => {
                tablePredictor.updateTableHistory(tableName, r);
            });
            const newHistory = tablePredictor.getTableHistory(tableName);
            console.log(`[API] Đã thêm ${allResults.length} kết quả từ baccaratData cho bàn ${tableName}`);
            console.log(`[API] Bàn ${tableName} hiện có ${newHistory.length} kết quả`);
        }
    }
    
    const finalHistory = tablePredictor.getTableHistory(tableName);
    if (finalHistory.length < 3) {
        return res.json({
            success: false,
            message: `Bàn ${tableName} chưa có đủ dữ liệu (cần ít nhất 3 kết quả, hiện có ${finalHistory.length})`,
            prediction: 'B',
            confidence: 0.5,
            historyLength: finalHistory.length,
            availableTables: baccaratData.map(item => item.table),
            tableData: tableData || null
        });
    }

    const result = tablePredictor.predictTable(tableName);
    res.json(result);
});

app.get('/api/predict/all-tables', (req, res) => {
    console.log('[API] Dự đoán tất cả bàn');
    
    tablePredictor.updateTableHistoryFromBaccaratData();
    
    baccaratData.forEach(item => {
        if (item.table && item.result) {
            const resultChar = item.result.trim().toUpperCase();
            if (resultChar === 'B' || resultChar === 'P') {
                tablePredictor.updateTableHistory(item.table, resultChar);
            }
        }
    });

    const results = tablePredictor.predictAllTables();
    
    const tableInfo = {};
    baccaratData.forEach(item => {
        if (item.table) {
            tableInfo[item.table] = {
                result: item.result,
                shoeId: item.shoeId,
                round: item.round
            };
        }
    });
    
    const stats = {
        totalTables: Object.keys(results).length,
        totalBaccaratTables: baccaratData.length,
        timestamp: new Date().toISOString()
    };

    res.json({
        success: true,
        stats: stats,
        data: results,
        baccaratData: baccaratData,
        tableInfo: tableInfo,
        tableHistory: tablePredictor.tableHistory
    });
});

app.post('/api/predict/table/:table/train', (req, res) => {
    const tableName = req.params.table;
    const { result } = req.body;

    if (!result || (result !== 'B' && result !== 'P')) {
        return res.status(400).json({ success: false, message: 'result phải là B hoặc P' });
    }

    const trainResult = tablePredictor.addResultAndTrain(tableName, result);
    res.json(trainResult);
});

app.post('/api/predict/all-tables/train', (req, res) => {
    const { results } = req.body;
    
    if (!results || typeof results !== 'object') {
        return res.status(400).json({ success: false, message: 'results phải là object { table: result }' });
    }

    const trained = [];
    Object.entries(results).forEach(([table, result]) => {
        if (result === 'B' || result === 'P') {
            const r = tablePredictor.addResultAndTrain(table, result);
            trained.push(r);
        }
    });

    res.json({
        success: true,
        trained: trained,
        total: trained.length
    });
});

app.get('/api/predict/table/:table/history', (req, res) => {
    const tableName = req.params.table;
    const history = tablePredictor.getTableHistory(tableName);
    const limit = parseInt(req.query.limit) || 50;

    res.json({
        success: true,
        table: tableName,
        history: history.slice(-limit),
        total: history.length,
        limit: limit
    });
});

app.post('/api/predict/table/:table/reset', (req, res) => {
    const tableName = req.params.table;
    const result = tablePredictor.resetTable(tableName);
    res.json(result);
});

app.post('/api/predict/all-tables/reset', (req, res) => {
    const result = tablePredictor.resetAll();
    res.json(result);
});

app.get('/api/predict/all-tables/strategy', (req, res) => {
    const strategy = req.query.strategy || 'ensemble';
    
    baccaratData.forEach(item => {
        if (item.result) {
            const resultChar = item.result.trim().toUpperCase();
            if (resultChar === 'B' || resultChar === 'P') {
                tablePredictor.updateTableHistory(item.table, resultChar);
            }
        }
    });

    const tables = Object.keys(tablePredictor.tableHistory);
    const results = {};
    
    tables.forEach(table => {
        const hist = tablePredictor.getTableHistory(table);
        if (hist.length >= 3) {
            if (strategy === 'ensemble') {
                results[table] = tablePredictor.predictTable(table);
            } else {
                const pred = predictByStrategy(hist, strategy);
                results[table] = {
                    table: table,
                    prediction: pred.prediction,
                    confidence: pred.confidence,
                    strategy: strategy,
                    bridge: new BaccaratBridgeAnalyzer(hist).detectCurrentBridge(),
                    historyLength: hist.length
                };
            }
        }
    });

    res.json({
        success: true,
        strategy: strategy,
        data: results,
        timestamp: new Date().toISOString()
    });
});

app.get('/api/predict/compare', (req, res) => {
    baccaratData.forEach(item => {
        if (item.result) {
            const resultChar = item.result.trim().toUpperCase();
            if (resultChar === 'B' || resultChar === 'P') {
                tablePredictor.updateTableHistory(item.table, resultChar);
            }
        }
    });

    const tables = Object.keys(tablePredictor.tableHistory);
    const predictions = {};
    const stats = {
        totalB: 0,
        totalP: 0,
        avgConfidence: 0
    };

    tables.forEach(table => {
        const pred = tablePredictor.predictTable(table);
        if (pred.success) {
            predictions[table] = pred;
            if (pred.prediction === 'B') stats.totalB++;
            else stats.totalP++;
            stats.avgConfidence += pred.confidence;
        }
    });

    if (tables.length > 0) {
        stats.avgConfidence /= tables.length;
    }

    const consensus = stats.totalB > stats.totalP ? 'B' : 'P';
    const consensusStrength = Math.abs(stats.totalB - stats.totalP) / tables.length;

    res.json({
        success: true,
        tables: tables,
        predictions: predictions,
        stats: stats,
        consensus: {
            prediction: consensus,
            strength: consensusStrength,
            confidence: consensusStrength > 0.6 ? 'CAO' : 'THẤP'
        },
        timestamp: new Date().toISOString()
    });
});

// ==================== API KIỂM TRA DỮ LIỆU BÀN ====================
app.get('/api/table/:table/check', (req, res) => {
    const tableName = req.params.table;
    
    const tableData = baccaratData.filter(item => item.table === tableName);
    const history = tablePredictor.getTableHistory(tableName);
    const tsKhangHistory = tsKhang.history;
    
    res.json({
        success: true,
        table: tableName,
        baccaratData: {
            count: tableData.length,
            data: tableData.slice(-20)
        },
        tablePredictor: {
            historyLength: history.length,
            history: history.slice(-20)
        },
        tsKhang: {
            historyLength: tsKhangHistory.length,
            history: tsKhangHistory.slice(-20)
        },
        allTables: baccaratData.map(item => item.table),
        uniqueTables: [...new Set(baccaratData.map(item => item.table))]
    });
});

// ==================== API FORCE UPDATE ====================
app.post('/api/table/force-update', (req, res) => {
    console.log('[API] Force update all tables');
    
    let updated = 0;
    baccaratData.forEach(item => {
        if (item.table && item.result) {
            const resultChar = item.result.trim().toUpperCase();
            if (resultChar === 'B' || resultChar === 'P') {
                if (!tablePredictor.tableHistory[item.table]) {
                    tablePredictor.tableHistory[item.table] = [];
                }
                const hist = tablePredictor.tableHistory[item.table];
                const lastResult = hist.length > 0 ? hist[hist.length - 1] : null;
                
                if (lastResult !== resultChar) {
                    hist.push(resultChar);
                    updated++;
                    if (hist.length > 500) {
                        hist.shift();
                    }
                    tablePredictor.tablePredictors[item.table] = new TsKhangBridge(hist);
                    tablePredictor.tableBridges[item.table] = new BaccaratBridgeAnalyzer(hist);
                }
            }
        }
    });
    
    const table1Data = baccaratData.find(item => item.table === '1');
    if (table1Data && table1Data.result) {
        const resultChar = table1Data.result.trim().toUpperCase();
        if (resultChar === 'B' || resultChar === 'P') {
            const lastHist = tsKhang.history[tsKhang.history.length - 1];
            if (lastHist !== resultChar) {
                tsKhang.addResultAndTrain(resultChar);
            }
        }
    }
    
    res.json({
        success: true,
        message: `Đã cập nhật ${updated} kết quả mới`,
        updated: updated,
        totalTables: Object.keys(tablePredictor.tableHistory).length,
        tableHistory: tablePredictor.tableHistory
    });
});

app.post('/api/train', (req, res) => {
    const { result } = req.body;
    if (!result || (result !== 'B' && result !== 'P')) return res.status(400).json({ success: false, message: 'result phải là B hoặc P' });
    tsKhang.addResultAndTrain(result);
    res.json({ success: true, message: `Đã thêm ${result} và cập nhật weights` });
});

app.post('/api/train/batch', (req, res) => {
    const { results } = req.body;
    if (!results || !Array.isArray(results) || results.length === 0) return res.status(400).json({ success: false, message: 'results phải là mảng B/P' });
    let added = 0;
    results.forEach(r => { if (r === 'B' || r === 'P') { tsKhang.addResultAndTrain(r); added++; } });
    res.json({ success: true, added, total: results.length });
});

app.get('/api/status', (req, res) => {
    const stats = tsKhang.getStats();
    const bridge = tsKhang.getBridgeInfo();
    const patterns = tsKhang.getPatterns();
    const streaks = tsKhang.getStreaks();
    const runs = tsKhang.getRuns();
    res.json({ success: true, historyLength: tsKhang.history.length, stats, bridge, patterns, streaks, runs, weights: tsKhang.ensemble.weights, modules: Object.keys(tsKhang.ensemble.modules).length, performanceLog: tsKhang.ensemble.performanceLog.slice(-20) });
});

app.get('/api/backtest', (req, res) => {
    res.json(tsKhang.backtest());
});

app.post('/api/reset', (req, res) => {
    tsKhang.history = [];
    tsKhang.ensemble.weights = {};
    Object.keys(tsKhang.ensemble.modules).forEach(k => tsKhang.ensemble.weights[k] = 1.0);
    tsKhang.ensemble.performanceLog = [];
    tsKhang.saveState();
    res.json({ success: true, message: 'Đã reset toàn bộ dữ liệu' });
});

// ==================== WEBSOCKET ====================
const wss = new WebSocket.Server({ port: 5001 });
wss.on('connection', (ws) => {
    console.log('[WS] Client connected');
    ws.send(JSON.stringify({ type: 'status', data: { stats: tsKhang.getStats(), bridge: tsKhang.getBridgeInfo() } }));
    tsKhang.eventBus.on('newResult', (data) => { 
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'newResult', data }));
        }
    });
    ws.on('close', () => console.log('[WS] Client disconnected'));
});

// ==================== AUTO UPDATE ====================
async function autoUpdate() {
    while (true) {
        try {
            await fetchBaccaratData();
            if (baccaratData && baccaratData.length > 0) {
                baccaratData.forEach(item => {
                    if (item.result) {
                        const resultChar = item.result.trim().toUpperCase();
                        if (resultChar === 'B' || resultChar === 'P') {
                            tablePredictor.updateTableHistory(item.table, resultChar);
                            
                            if (item.table === '1') {
                                const lastHist = tsKhang.history[tsKhang.history.length - 1];
                                if (lastHist !== resultChar) {
                                    tsKhang.addResultAndTrain(resultChar);
                                }
                            }
                        }
                    }
                });
            }
        } catch (error) {
            console.error('[AutoUpdate] Error:', error.message);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

// ==================== KHỞI TẠO DỮ LIỆU BAN ĐẦU ====================
async function initializeTableData() {
    console.log('[Init] Đang khởi tạo dữ liệu cho các bàn...');
    
    if (baccaratData.length === 0) {
        await fetchBaccaratData();
    }
    
    tablePredictor.updateTableHistoryFromBaccaratData();
    
    baccaratData.forEach(item => {
        if (item.table && item.result) {
            const resultChar = item.result.trim().toUpperCase();
            if (resultChar === 'B' || resultChar === 'P') {
                tablePredictor.updateTableHistory(item.table, resultChar);
            }
        }
    });
    
    console.log('[Init] Dữ liệu các bàn:');
    Object.keys(tablePredictor.tableHistory).forEach(table => {
        const hist = tablePredictor.tableHistory[table];
        console.log(`   Bàn ${table}: ${hist.length} kết quả`);
        if (hist.length > 0) {
            console.log(`      Gần nhất: ${hist.slice(-5).join(' -> ')}`);
        }
    });
}

// ==================== KHỞI ĐỘNG ====================
async function start() {
    console.log('========================================');
    console.log('BACCARAT MULTI-AI ENSEMBLE ULTRA v3.0');
    console.log('========================================');
    console.log('Modules:', Object.keys(tsKhang.ensemble.modules).join(', '));
    
    console.log('[1] Đang đăng nhập...');
    if (!await login()) { 
        console.error('[ERROR] Đăng nhập thất bại!'); 
        process.exit(1); 
    }
    console.log('[OK] Đăng nhập thành công');
    
    console.log('[2] Vào lobby...');
    await goToLobby();
    console.log('[OK] Vào lobby thành công');
    
    console.log('[3] Lấy dữ liệu lần đầu...');
    await fetchBaccaratData();
    console.log(`[OK] Đã lấy ${baccaratData.length} bàn`);
    
    console.log('[4] Khởi tạo dữ liệu cho các bàn...');
    await initializeTableData();
    
    console.log(`[5] TS Khang: ${tsKhang.history.length} mẫu`);
    const bridge = tsKhang.getBridgeInfo();
    console.log(`    Bridge: ${bridge.type} (len=${bridge.length}, side=${bridge.side})`);
    const stats = tsKhang.getStats();
    console.log(`    Stats: B=${stats.B} P=${stats.P} ratio=${stats.ratio} entropy=${stats.entropy?.toFixed(3) || 'N/A'}`);
    
    if (tsKhang.history.length > 20) {
        const bt = tsKhang.backtest();
        if (bt.success) {
            console.log(`    Backtest: ${bt.wins}/${bt.total} = ${bt.winRate} (profit=${bt.profit})`);
        }
    }
    
    autoUpdate();
    const PORT = 5000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n🚀 API SERVER:`);
        console.log(`   GET  /api/baccarat`);
        console.log(`   GET  /api/baccarat/:table`);
        console.log(`   GET  /api/latest`);
        console.log(`   GET  /api/predict`);
        console.log(`   GET  /api/predict/advanced`);
        console.log(`   GET  /api/predict/evaluate`);
        console.log(`   GET  /api/predict/probability`);
        console.log(`   GET  /api/predict/realtime`);
        console.log(`   GET  /api/predict/patterns`);
        console.log(`   GET  /api/predict/sequence/:length`);
        console.log(`   GET  /api/predict/table/:table`);
        console.log(`   GET  /api/predict/all-tables`);
        console.log(`   POST /api/predict/table/:table/train`);
        console.log(`   POST /api/predict/all-tables/train`);
        console.log(`   GET  /api/predict/table/:table/history`);
        console.log(`   POST /api/predict/table/:table/reset`);
        console.log(`   POST /api/predict/all-tables/reset`);
        console.log(`   GET  /api/predict/all-tables/strategy`);
        console.log(`   GET  /api/predict/compare`);
        console.log(`   GET  /api/table/:table/check`);
        console.log(`   POST /api/table/force-update`);
        console.log(`   POST /api/train`);
        console.log(`   POST /api/train/batch`);
        console.log(`   GET  /api/status`);
        console.log(`   GET  /api/backtest`);
        console.log(`   POST /api/reset`);
        console.log(`\n🔌 WebSocket: ws://localhost:5001`);
        console.log(`⏰ Auto update mỗi 2 giây`);
        console.log(`📊 Log file: ${tsKhang.logFile}`);
        console.log(`\n✅ SERVER ĐANG CHẠY TẠI http://localhost:${PORT}`);
    });
}

start().catch(console.error);

// ==================== EXPORT ====================
module.exports = { 
    TsKhangBridge, 
    MultiAIEnsembleUltra, 
    BaccaratBridgeAnalyzer,
    BaccaratPredictor,
    TablePredictor,
    Utils,
    predictBaccarat,
    quickPredict,
    predictByStrategy,
    comprehensivePredict,
    app,
    session,
    login,
    goToLobby,
    fetchBaccaratData,
    autoUpdate,
    initializeTableData,
    baccaratData,
    lastUpdate,
    tsKhang,
    predictor,
    tablePredictor
};
