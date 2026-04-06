def build_prompt(query, chunks):
    context = "\n\n".join(chunks)

    return f"""
    Answer ONLY using this context.
    If not found, say "I don't know".

    Context:
    {context}

    Question:
    {query}
    """