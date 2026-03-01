import { test, expect, vi } from 'vitest';
import axios from 'axios';

vi.mock("axios", () => {
    return {
        default: {
            post: vi.fn().mockResolvedValue({ status: 500 }),
            get: vi.fn().mockResolvedValue({ status: 500 })
        }
    };
});

test('axios mock', async () => {
    const res = await axios.post('abc');
    console.log(res);
});
