import os

old_text = 'Alfe AI is an open source platform that combines AI-assisted image design, software development, and task management.'
new_text = 'Alfe AI is an open source platform that combines AI-assisted software development, chat, and task management.'

dirs_to_search = ['/git/sterling/b9a3f01e-013f-4988-96ba-f733d59dd247/alfe-ai-1771347735652/AlfeCode', '/git/sterling/b9a3f01e-013f-4988-96ba-f733d59dd247/alfe-ai-1771347735652/Aurora']

for dir_to_search in dirs_to_search:
    for dirpath, dirnames, filenames in os.walk(dir_to_search):
        for filename in filenames:
            file_path = os.path.join(dirpath, filename)
            try:
                with open(file_path, 'r') as file:
                    content = file.read()
                
                if old_text in content:
                    new_content = content.replace(old_text, new_text)
                    with open(file_path, 'w') as file:
                        file.write(new_content)
                    print(f'Replaced in: {file_path}')
            except Exception as e:
                print(f'Error processing {file_path}: {str(e)}')