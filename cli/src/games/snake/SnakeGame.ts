export enum Direction {
  UP,
  DOWN,
  LEFT,
  RIGHT,
}

export interface Point {
  x: number;
  y: number;
}

export class SnakeGame {
  private snake: Point[];
  private food: Point;
  private direction: Direction;
  private width: number;
  private height: number;
  private score: number;
  private isGameOver: boolean;

  constructor(width: number, height: number) {
    if (width < 10 || height < 10) {
      throw new Error(`Invalid board dimensions: ${width}x${height}. Minimum 10x10 required.`);
    }
    this.width = width;
    this.height = height;
    this.snake = [
      { x: Math.floor(width / 2), y: Math.floor(height / 2) },
      { x: Math.floor(width / 2), y: Math.floor(height / 2) + 1 },
      { x: Math.floor(width / 2), y: Math.floor(height / 2) + 2 },
    ];
    this.food = this.generateFood();
    this.direction = Direction.UP;
    this.score = 0;
    this.isGameOver = false;
  }

  public update(): void {
    if (this.isGameOver) return;

    const head = { ...this.snake[0] };

    switch (this.direction) {
      case Direction.UP:
        head.y--;
        break;
      case Direction.DOWN:
        head.y++;
        break;
      case Direction.LEFT:
        head.x--;
        break;
      case Direction.RIGHT:
        head.x++;
        break;
    }

    // Collision check: Walls
    if (head.x < 0 || head.x >= this.width || head.y < 0 || head.y >= this.height) {
      this.isGameOver = true;
      return;
    }

    // Collision check: Self
    if (this.snake.some((segment) => segment.x === head.x && segment.y === head.y)) {
      this.isGameOver = true;
      return;
    }

    this.snake.unshift(head);

    // Food check
    if (head.x === this.food.x && head.y === this.food.y) {
      this.score += 10;
      this.food = this.generateFood();
    } else {
      this.snake.pop();
    }
  }

  private generateFood(): Point {
    const area = this.width * this.height;
    if (this.snake.length >= area) {
      // Board is full, nowhere to place food
      return { x: -1, y: -1 };
    }

    let newFood: Point;
    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
      newFood = {
        x: Math.floor(Math.random() * this.width),
        y: Math.floor(Math.random() * this.height),
      };
      const onSnake = this.snake.some(
        (segment) => segment.x === newFood.x && segment.y === newFood.y
      );
      if (!onSnake) return newFood;
      attempts++;
    }

    // Fallback: If random picking fails too many times, find the first free cell
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (!this.snake.some((s) => s.x === x && s.y === y)) {
          return { x, y };
        }
      }
    }

    return { x: -1, y: -1 };
  }

  public setDirection(newDirection: Direction): void {
    // Prevent 180-degree turns
    const isOpposite =
      (this.direction === Direction.UP && newDirection === Direction.DOWN) ||
      (this.direction === Direction.DOWN && newDirection === Direction.UP) ||
      (this.direction === Direction.LEFT && newDirection === Direction.RIGHT) ||
      (this.direction === Direction.RIGHT && newDirection === Direction.LEFT);

    if (!isOpposite) {
      this.direction = newDirection;
    }
  }

  public getSnake(): Point[] {
    return this.snake;
  }

  public getFood(): Point {
    return this.food;
  }

  public getScore(): number {
    return this.score;
  }

  public getGameOver(): boolean {
    return this.isGameOver;
  }
}
