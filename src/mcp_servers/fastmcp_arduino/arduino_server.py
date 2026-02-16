import sys
import json
import time
import random

# Try to import pyfirmata2, otherwise mock it
try:
    import pyfirmata2
    USE_MOCK = False
except ImportError:
    USE_MOCK = True

class ArduinoController:
    def __init__(self):
        self.board = None
        self.pins = {}
        if not USE_MOCK:
            try:
                # Auto-detect port
                self.board = pyfirmata2.Arduino(pyfirmata2.Arduino.AUTODETECT)
                print(json.dumps({"type": "log", "message": "Connected to Arduino via pyfirmata2"}), flush=True)
            except Exception as e:
                print(json.dumps({"type": "error", "message": f"Failed to connect to Arduino: {e}. Falling back to mock."}), flush=True)
                USE_MOCK = True

        if USE_MOCK:
            print(json.dumps({"type": "log", "message": "Running in MOCK mode"}), flush=True)

    def process_command(self, command):
        cmd_type = command.get("command")
        req_id = command.get("id")

        response = {}
        if req_id is not None:
            response["id"] = req_id

        if cmd_type == "led_on":
            pin = command.get("pin", 13)
            if not USE_MOCK and self.board:
                self.board.digital[pin].write(1)
            response.update({"status": "success", "message": f"LED on pin {pin} turned ON"})

        elif cmd_type == "led_off":
            pin = command.get("pin", 13)
            if not USE_MOCK and self.board:
                self.board.digital[pin].write(0)
            response.update({"status": "success", "message": f"LED on pin {pin} turned OFF"})

        elif cmd_type == "motor_move":
            pin = command.get("pin", 9)
            angle = command.get("angle", 0)
            if not USE_MOCK and self.board:
                # Assuming servo attached to pin
                self.board.digital[pin].write(angle)
            response.update({"status": "success", "message": f"Motor on pin {pin} moved to {angle} degrees"})

        elif cmd_type == "get_pin_status":
            pin = command.get("pin")
            mode = command.get("mode", "digital") # digital or analog

            val = 0
            if not USE_MOCK and self.board:
                 # Read logic (simplified)
                 pass
            else:
                 val = random.randint(0, 1) if mode == "digital" else random.randint(0, 1023)

            response.update({"status": "success", "value": val, "pin": pin})

        else:
            response.update({"status": "error", "message": "Unknown command"})

        return response

def main():
    controller = ArduinoController()

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            command = json.loads(line.strip())
            result = controller.process_command(command)
            print(json.dumps(result), flush=True)

        except json.JSONDecodeError:
            print(json.dumps({"status": "error", "message": "Invalid JSON"}), flush=True)
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}), flush=True)

if __name__ == "__main__":
    main()
