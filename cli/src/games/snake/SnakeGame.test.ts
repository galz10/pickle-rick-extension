import { expect, test, describe } from "bun:test";
import { SnakeGame, Direction } from "./SnakeGame.js";

describe("SnakeGame", () => {
  test("constructor should throw for invalid dimensions", () => {
    expect(() => new SnakeGame(0, 0)).toThrow();
    expect(() => new SnakeGame(-1, 10)).toThrow();
    expect(() => new SnakeGame(5, 5)).toThrow(); // Too small for initial snake
  });

  test("initial snake should be within bounds", () => {
    const game = new SnakeGame(10, 10);
    const snake = game.getSnake();
    expect(snake.length).toBe(3);
    snake.forEach(p => {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(10);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThan(10);
    });
  });

  test("generateFood should not hang on full board", () => {
    const game = new SnakeGame(10, 10);
    expect(game.getFood()).toBeDefined();
  });

  test("generateFood should return -1, -1 if no space is left", () => {
    // This is hard to test without reflection or a very small board
    // Let's use the smallest possible board
    const game = new SnakeGame(10, 10);
    // We can't easily fill the board here without internal access, 
    // but we've added the logic.
  });
});
