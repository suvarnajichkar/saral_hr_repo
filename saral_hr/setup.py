def before_install():
    import subprocess
    import sys

    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "PyPDF2"])
        print("✅ PyPDF2 successfully installed.")
    except Exception as e:
        print("❌ Error installing PyPDF2:", e)
