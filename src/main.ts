// 1. 質点（Node）クラス
class TrussNode {
    x: number;
    y: number;
    px: number;
    py: number;
    isStatic: boolean;

    constructor(x: number, y: number, isStatic: boolean = false) {
        this.x = x;
        this.y = y;
        this.px = x;
        this.py = y;
        this.isStatic = isStatic;
    }

    update(gravity: number, dt: number) {
        if (this.isStatic) return;

        const vx = this.x - this.px;
        const vy = this.y - this.py;

        this.px = this.x;
        this.py = this.y;

        // 空気抵抗（ダンピング）を少し強めにして振動を抑える
        this.x += vx * 0.98;
        this.y += vy * 0.98 + gravity * dt * dt;
    }
}

// 2. 構造材（Link）クラス
class TrussLink {
    nodeA: TrussNode;
    nodeB: TrussNode;
    targetLength: number;
    stiffness: number; // 剛性（高いほど硬い橋になる）
    stress: number = 0; // 負荷（正：張力 / 負：圧縮力）

    constructor(nodeA: TrussNode, nodeB: TrussNode, stiffness: number = 1.0) {
        this.nodeA = nodeA;
        this.nodeB = nodeB;
        this.stiffness = stiffness;

        const dx = nodeA.x - nodeB.x;
        const dy = nodeA.y - nodeB.y;
        this.targetLength = Math.sqrt(dx * dx + dy * dy);
    }

    resolve() {
        const dx = this.nodeB.x - this.nodeA.x;
        const dy = this.nodeB.y - this.nodeA.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) return;

        // 誤差（本来の長さからのズレ）
        const diff = this.targetLength - distance;

        // 歪み率を記録（正なら圧縮、負なら張力。計算しやすいよう符号を調整）
        // 本来の長さより「縮んでいる（diff > 0）」＝ 圧縮（青）
        // 本来の長さより「伸びている（diff < 0）」＝ 張力（赤）
        this.stress = diff / this.targetLength;

        // 位置の修正（ばねのように引き戻す・押し返す）
        const percent = (diff / distance) * 0.5 * this.stiffness;
        const offsetX = dx * percent;
        const offsetY = dy * percent;

        if (!this.nodeA.isStatic) {
            this.nodeA.x -= offsetX;
            this.nodeA.y -= offsetY;
        }
        if (!this.nodeB.isStatic) {
            this.nodeB.x += offsetX;
            this.nodeB.y += offsetY;
        }
    }
}

// 3. シミュレーター本体
class BridgeSimulator {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private nodes: TrussNode[] = [];
    private links: TrussLink[] = [];
    private gravity = 9.8 * 80; // 重力の強さ
    private draggedNode: TrussNode | null = null;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.initBridge();
        this.setupEvents();
    }

    // トラス橋（ワーレントラス型）の自動生成
    private initBridge() {
        const startX = 100;
        const bottomY = 250; // 下弦材の高さ
        const topY = 180;    // 上弦材の高さ
        const numPanels = 6; // トラスのパネル数（山・谷の数）
        const panelWidth = 100; // 1ブロックの幅

        const bottomNodes: TrussNode[] = [];
        const topNodes: TrussNode[] = [];

        // 1. 下側のノード（道路部分）を生成
        for (let i = 0; i <= numPanels; i++) {
            // 両端の下角を固定点（橋台）にする
            const isStatic = (i === 0 || i === numPanels);
            const node = new TrussNode(startX + i * panelWidth, bottomY, isStatic);
            this.nodes.push(node);
            bottomNodes.push(node);
        }

        // 2. 上側のノードを生成（トラスの上の頂点。下弦の間を埋めるように配置）
        for (let i = 0; i < numPanels; i++) {
            const node = new TrussNode(startX + (i + 0.5) * panelWidth, topY, false);
            this.nodes.push(node);
            topNodes.push(node);
        }

        // 3. リンクの接続（構造を組む）
        const stiffness = 1.0; // 鉄骨の硬さ

        // 下弦材（床）を繋ぐ
        for (let i = 0; i < bottomNodes.length - 1; i++) {
            this.links.push(new TrussLink(bottomNodes[i], bottomNodes[i + 1], stiffness));
        }
        // 上弦材（天井）を繋ぐ
        for (let i = 0; i < topNodes.length - 1; i++) {
            this.links.push(new TrussLink(topNodes[i], topNodes[i + 1], stiffness));
        }
        // 斜材（ジグザグのトラス骨組み）を繋ぐ
        for (let i = 0; i < numPanels; i++) {
            // 左上がりの斜材
            this.links.push(new TrussLink(bottomNodes[i], topNodes[i], stiffness));
            // 右下がりの斜材
            this.links.push(new TrussLink(topNodes[i], bottomNodes[i + 1], stiffness));
        }
    }

    // 負荷（stress）に応じた色を計算する（赤＝張力、青＝圧縮、緑＝無負荷）
    private getStressColor(stress: number): string {
        // 感度調整。この値が小さいほど、わずかな変形で色がビビッドに変わる
        const maxSensitivity = 0.01; 
        const ratio = Math.min(Math.abs(stress) / maxSensitivity, 1);

        if (stress < 0) {
            // stress < 0 ＝ 伸びている ＝ 張力（赤）
            const r = Math.floor(ratio * 255);
            const g = Math.floor((1 - ratio) * 200);
            return `rgb(${r}, ${g}, 0)`;
        } else {
            // stress > 0 ＝ 縮んでいる ＝ 圧縮（青）
            const b = Math.floor(ratio * 255);
            const g = Math.floor((1 - ratio) * 200);
            return `rgb(0, ${g}, ${b})`;
        }
    }

    private setupEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            // 固定点も含めて、一番近いノードをドラッグできるようにする（橋に無理やり重荷をかけるため）
            for (const node of this.nodes) {
                if (Math.hypot(node.x - mx, node.y - my) < 20) {
                    this.draggedNode = node;
                    break;
                }
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.draggedNode) return;
            const rect = this.canvas.getBoundingClientRect();
            this.draggedNode.x = e.clientX - rect.left;
            this.draggedNode.y = e.clientY - rect.top;
            // ドラッグ中は速度履歴をリセットして挙動を安定させる
            this.draggedNode.px = this.draggedNode.x;
            this.draggedNode.py = this.draggedNode.y;
        });

        window.addEventListener('mouseup', () => {
            this.draggedNode = null;
        });
    }

    public start() {
        const loop = () => {
            this.update();
            this.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    private update() {
        const dt = 1 / 60;

        // 物理更新
        for (const node of this.nodes) {
            this.updateNodeWeight(node); // 中央部のノードに擬似的な「自重・車」の重みを足す
            node.update(this.gravity, dt);
        }

        // トラス構造は硬いため、計算の反復回数を多くする（15回）
        const iterations = 15;
        for (let i = 0; i < iterations; i++) {
            for (const link of this.links) {
                link.resolve();
            }
        }
    }

    // 橋のリアルな挙動のため、中央にいくほど重くなるよう外力を調整
    private updateNodeWeight(node: TrussNode) {
        if (node.isStatic) return;
        // 橋の中央部（x=400付近）の下弦ノードに、常時下向きの負荷がかかるようにする
        if (node.y > 200 && node.x > 300 && node.x < 500) {
            node.y += 0.15; // 擬似的な持続荷重（車の重みなど）
        }
    }

    private render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // 背景に簡単なガイドライン（地面など）を描画
        this.ctx.strokeStyle = '#eee';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(100, 250, 600, 1);

        // 鉄骨（リンク）の描画
        for (const link of this.links) {
            this.ctx.beginPath();
            this.ctx.moveTo(link.nodeA.x, link.nodeA.y);
            this.ctx.lineTo(link.nodeB.x, link.nodeB.y);
            
            this.ctx.strokeStyle = this.getStressColor(link.stress);
            // 負荷が強いほど線を少し太くする
            this.ctx.lineWidth = 4 + Math.min(Math.abs(link.stress) * 200, 6); 
            this.ctx.stroke();
        }

        // 接合部（ノード）の描画
        for (const node of this.nodes) {
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, node.isStatic ? 8 : 5, 0, Math.PI * 2);
            this.ctx.fillStyle = node.isStatic ? '#2c3e50' : '#7f8c8d';
            this.ctx.fill();
        }

        // UIテキスト（凡例）の描画
        this.ctx.font = '14px Arial';
        this.ctx.fillStyle = 'red';
        this.ctx.fillText('■ 張力 (Tension / 引っ張り)', 20, 30);
        this.ctx.fillStyle = 'blue';
        this.ctx.fillText('■ 圧縮力 (Compression / 押し潰し)', 20, 50);
        this.ctx.fillStyle = '#7f8c8d';
        this.ctx.fillText('※ 橋のノードをマウスでドラッグして負荷をテストできます', 20, 80);
    }
}

// 実行
// const sim = new BridgeSimulator('bridgeCanvas');
// sim.start();
// 最後にシミュレーターを起動する処理を追加
window.addEventListener('DOMContentLoaded', () => {
    const sim = new BridgeSimulator('bridgeCanvas');
    sim.start();
});